// Vercel Edge Function - AI Image Analysis
// Edge Functions have no 10s timeout limit on Hobby plan
export const config = { runtime: 'edge' };

// ---- KV helpers ----
async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value: String(value) }),
  });
}

// ---- Parse Google ID token (edge-friendly) ----
function parseGoogleToken(idToken) {
  try {
    const [, payload] = idToken.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!decoded.sub) return null;
    return { sub: decoded.sub, email: decoded.email };
  } catch {
    return null;
  }
}

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers, status: 405 });
  }

  // ---- Credits check ----
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.replace('Bearer ', '').trim();

  if (!idToken) {
    return new Response(JSON.stringify({ error: 'login_required', message: 'Please sign in to analyze photos.' }), { headers, status: 401 });
  }

  const user = parseGoogleToken(idToken);
  if (!user) {
    return new Response(JSON.stringify({ error: 'invalid_token', message: 'Invalid session. Please sign in again.' }), { headers, status: 401 });
  }

  const creditsKey = `credits:${user.sub}`;
  const initKey = `init:${user.email}`;

  // Initialize new user credits
  let credits = await kvGet(creditsKey);
  if (credits === null) {
    const alreadyInit = await kvGet(initKey);
    if (!alreadyInit) {
      await kvSet(creditsKey, 3);
      await kvSet(initKey, '1');
      credits = 3;
    } else {
      credits = 0;
    }
  }
  credits = Number(credits);

  if (credits <= 0) {
    return new Response(JSON.stringify({
      error: 'no_credits',
      message: 'You have used all your free credits.',
      credits: 0
    }), { headers, status: 402 });
  }

  // Deduct 1 credit before analysis
  await kvSet(creditsKey, credits - 1);

  try {
    const body = await req.json();
    const { images } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: 'No images provided' }), { headers, status: 400 });
    }

    const results = [];
    for (const img of images) {
      const analysis = await analyzeImage(img.base64);
      results.push({ id: img.id, ...analysis });
    }

    return new Response(JSON.stringify({ results, credits: credits - 1 }), { headers, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Analysis failed',
      details: error.message
    }), { headers, status: 500 });
  }
}

async function analyzeImage(base64Image) {
  const API_KEY = process.env.QWEN_API_KEY;
  const API_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  if (!API_KEY) {
    throw new Error('QWEN_API_KEY is not configured');
  }

  const prompt = `You are a professional home inspector analyzing a property photo.

Identify any defects, issues, or concerns. Return ONLY a valid JSON object:

{
  "issue": "Brief issue name (e.g., 'Foundation Crack', 'Water Damage', 'Roof Shingle Damage')",
  "severity": "critical" | "moderate" | "minor",
  "description": "Professional 2-3 sentence description suitable for an inspection report",
  "confidence": 0.0-1.0,
  "location": "Identifiable room/area (e.g., 'Basement', 'Kitchen', 'Exterior Wall')",
  "recommendation": "Brief repair or further evaluation suggestion"
}

Severity guide:
- critical: Safety hazards, structural issues, severe water damage, electrical hazards
- moderate: Needs repair but not urgent, surface damage with potential underlying issues
- minor: Cosmetic issues, minor wear, maintenance items

If no issues found, set issue to "No Issues Found", severity to "minor", and describe the normal condition.

Return ONLY JSON, no markdown or extra text.`;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen-vl-max',
      input: {
        messages: [{
          role: 'user',
          content: [
            { image: base64Image },
            { text: prompt }
          ]
        }]
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.output?.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content in response');
  }

  // Handle content that may be array or string
  const textContent = Array.isArray(content) 
    ? content.find(c => c.text)?.text || JSON.stringify(content)
    : content;

  let parsed;
  try {
    const jsonStr = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = {
      issue: 'Visual Analysis',
      severity: 'minor',
      description: textContent,
      confidence: 0.8,
      location: '',
      recommendation: 'Further inspection recommended'
    };
  }

  return {
    issue: parsed.issue || 'Visual Analysis',
    severity: ['critical', 'moderate', 'minor'].includes(parsed.severity) ? parsed.severity : 'minor',
    description: parsed.description || textContent,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
    location: parsed.location || '',
    recommendation: parsed.recommendation || 'Further inspection recommended'
  };
}
