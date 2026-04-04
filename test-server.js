// Simple test server for local development
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QWEN_API_KEY = process.env.QWEN_API_KEY;

console.log('=== TEST SERVER STARTING ===');
console.log('QWEN_API_KEY configured:', !!QWEN_API_KEY);
console.log('QWEN_API_KEY length:', QWEN_API_KEY?.length);

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Serve static files
  if (req.method === 'GET') {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'app.html');
    }
    
    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
      res.end(data);
    });
    return;
  }
  
  // Handle API requests
  if (req.url === '/api/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('=== ANALYSIS REQUEST ===');
        console.log('Images count:', data.images?.length);
        
        if (!data.images || data.images.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No images provided' }));
          return;
        }
        
        // Analyze each image
        const results = await Promise.all(data.images.map(async (img) => {
          const analysis = await analyzeImage(img.base64);
          return { id: img.id, ...analysis };
        }));
        
        console.log('=== ANALYSIS SUCCESS ===');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results));
      } catch (error) {
        console.error('=== ANALYSIS ERROR ===');
        console.error('Error:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

async function analyzeImage(base64Image) {
  console.log('[analyzeImage] API Key exists:', !!QWEN_API_KEY);
  console.log('[analyzeImage] Base64 length:', base64Image?.length);
  
  if (!QWEN_API_KEY) {
    throw new Error('QWEN_API_KEY is not configured');
  }
  
  const API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  
  const prompt = `You are a professional home inspector. Analyze this property photo and identify any issues.
Respond in JSON format with these fields:
{
  "issue": "Brief issue title (e.g., 'Wall Crack', 'Water Damage')",
  "severity": "critical" or "moderate" or "minor",
  "description": "Professional 2-3 sentence description of the issue",
  "confidence": 0.0-1.0 number,
  "location": "Suggested location if visible (e.g., 'Exterior wall', 'Ceiling')"
}
If no issues found, set issue to "No Issue" and severity to "minor".`;
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${QWEN_API_KEY}`,
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
  
  console.log('[analyzeImage] API response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[analyzeImage] Error response:', errorText);
    throw new Error(`Qwen API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  const content = data.output?.choices?.[0]?.message?.content;
  
  console.log('[analyzeImage] Raw Qwen response:', content);
  
  if (!content) {
    throw new Error('No content in Qwen response');
  }
  
  // Try to parse JSON from response
  try {
    // Qwen might return markdown code blocks, extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[analyzeImage] Parsed JSON:', parsed);
      return {
        issue: parsed.issue || 'Visual Analysis',
        severity: parsed.severity || 'minor',
        description: parsed.description || content,
        confidence: parsed.confidence || 0.9,
        location: parsed.location || ''
      };
    }
  } catch (e) {
    console.log('[analyzeImage] JSON parse failed, using fallback');
  }
  
  // Fallback: use raw text
  return {
    issue: 'Visual Analysis',
    severity: 'minor',
    description: content,
    confidence: 0.9,
    location: ''
  };
}

const PORT = 3003;
server.listen(PORT, () => {
  console.log(`=== SERVER READY ===`);
  console.log(`Open: http://localhost:${PORT}/app.html`);
});
