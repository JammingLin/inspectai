// Vercel Serverless Function - AI Image Analysis
// Uses Qwen-VL for visual recognition

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers, status: 405 });
  }

  try {
    const { images } = await req.json();
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: 'No images provided' }), { headers, status: 400 });
    }

    // Analyze each image with Qwen-VL
    const results = await Promise.all(images.map(async (img) => {
      const analysis = await analyzeImage(img.base64);
      return { id: img.id, ...analysis };
    }));

    return new Response(JSON.stringify(results), { headers, status: 200 });
  } catch (error) {
    console.error('Analysis error:', error);
    return new Response(JSON.stringify({ error: 'Analysis failed' }), { headers, status: 500 });
  }
}

async function analyzeImage(base64Image) {
  // Call Qwen-VL API for image analysis
  const API_KEY = 'sk-xxxxx'; // TODO: Set in Vercel env
  const API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  const prompt = `You are a professional home inspection expert. Analyze this property photo and identify any issues.

Respond in JSON format:
{
  "issue": "Brief issue name (e.g., 'Foundation Crack', 'Water Stain', 'Mold Growth')",
  "severity": "critical|moderate|minor",
  "description": "Professional description suitable for inspection report (2-3 sentences, technical but clear)",
  "confidence": 0.0-1.0,
  "location": "Suggested location if visible (optional)"
}

Focus on:
- Foundation issues (cracks, settling)
- Water damage (stains, leaks, mold)
- Structural problems
- Electrical issues
- Plumbing problems
- Roof damage
- Pest damage

If no issues found, still provide a description of the condition.`;

  try {
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
              { type: 'image', image: base64Image },
              { type: 'text', text: prompt }
            ]
          }]
        },
        parameters: {
          result_format: 'json',
          temperature: 0.3,
        }
      }),
    });

    if (!response.ok) {
      throw new Error('Qwen API error');
    }

    const data = await response.json();
    const content = data.output.choices[0].message.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      issue: 'General Condition',
      severity: 'minor',
      description: content,
      confidence: 0.8,
      location: ''
    };

    return analysis;
  } catch (error) {
    console.error('Qwen API error:', error);
    // Fallback response
    return {
      issue: 'Visual Inspection Required',
      severity: 'moderate',
      description: 'This area requires detailed visual inspection by a qualified home inspector. Please examine closely for potential issues.',
      confidence: 0.5,
      location: ''
    };
  }
}
