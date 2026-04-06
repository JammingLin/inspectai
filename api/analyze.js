// Vercel Edge Function - AI Image Analysis
export const config = { runtime: 'edge' };

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// ---- KV helpers ----
async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const data = await res.json();
  return data.result ?? null;
}

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: String(value) }),
  });
}

function parseGoogleToken(idToken) {
  try {
    const [, payload] = idToken.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.sub ? { sub: decoded.sub, email: decoded.email } : null;
  } catch { return null; }
}

export default async function handler(req) {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { headers: HEADERS, status: 200 });
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: HEADERS, status: 405 });

    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    if (!idToken) return new Response(JSON.stringify({ error: 'login_required' }), { headers: HEADERS, status: 401 });

    const user = parseGoogleToken(idToken);
    if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { headers: HEADERS, status: 401 });

    const creditsKey = `credits:${user.sub}`;
    let credits = await kvGet(creditsKey);
    credits = credits !== null ? Number(credits) : 0;

    if (credits <= 0) return new Response(JSON.stringify({ error: 'no_credits' }), { headers: HEADERS, status: 402 });

    await kvSet(creditsKey, credits - 1);

    const body = await req.json();
    const results = [];
    for (const img of body.images) {
      const analysis = await analyzeImage(img.base64);
      results.push({ id: img.id, ...analysis });
    }

    return new Response(JSON.stringify({ results, credits: credits - 1 }), { headers: HEADERS, status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', details: err.message }), { headers: HEADERS, status: 500 });
  }
}

async function analyzeImage(base64Image) {
  const API_KEY = process.env.QWEN_API_KEY;
  const API_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  if (!API_KEY) throw new Error('QWEN_API_KEY is not configured');

  const prompt = `Identify defects. JSON ONLY: {"issue":"Name","severity":"critical|moderate|minor","description":"Desc","confidence":0.9,"location":"Loc","recommendation":"Rec"}`;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-vl-max',
      input: { messages: [{ role: 'user', content: [{ image: base64Image }, { text: prompt }] }] }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.output?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in Qwen response');
  
  const textContent = Array.isArray(content) ? content.find(c => c.text)?.text : content;
  try {
    return JSON.parse(textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
  } catch {
    return { issue: 'Analysis Failed', severity: 'minor', description: textContent, confidence: 0 };
  }
}
