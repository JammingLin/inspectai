// Simple test server for local development
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

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
  
  // Handle /api/analyze
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
  
  // Handle /api/export-pdf
  if (req.url === '/api/export-pdf' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { report } = JSON.parse(body);
        console.log('=== PDF EXPORT REQUEST ===');
        console.log('Report items:', report?.length);
        
        if (!report || !Array.isArray(report)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid report data' }));
          return;
        }
        
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });
        
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        
        generateReport(doc, report);
        doc.end();
        
        await new Promise(resolve => doc.on('end', resolve));
        
        const pdfBuffer = Buffer.concat(chunks);
        
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="inspection-report-${Date.now()}.pdf"`,
        });
        res.end(pdfBuffer);
        console.log('=== PDF EXPORT SUCCESS ===');
      } catch (error) {
        console.error('=== PDF EXPORT ERROR ===');
        console.error('Error:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'PDF export failed' }));
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
  let content = data.output?.choices?.[0]?.message?.content;
  
  console.log('[analyzeImage] Raw Qwen response:', JSON.stringify(content));
  
  if (!content) {
    throw new Error('No content in Qwen response');
  }
  
  // Handle array format: [{ text: "..." }]
  if (Array.isArray(content)) {
    content = content[0]?.text || content.join('');
  }
  
  console.log('[analyzeImage] Extracted text:', content);
  
  // Try to parse JSON from response
  try {
    // Remove markdown code blocks
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
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
    console.log('[analyzeImage] JSON parse failed:', e.message);
  }
  
  // Fallback: use raw text
  return {
    issue: 'Visual Analysis',
    severity: 'minor',
    description: typeof content === 'string' ? content : JSON.stringify(content),
    confidence: 0.9,
    location: ''
  };
}

function generateReport(doc, report) {
  const colors = {
    primary: '#00d4ff',
    secondary: '#00ff9d',
    text: '#1e293b',
    muted: '#64748b',
    critical: '#ff6b35',
    moderate: '#ffc107',
    minor: '#00ff9d',
  };

  // Cover Page
  doc.fontSize(32).fillColor(colors.primary).text('InspectAI', 50, 100, { align: 'center' });
  doc.moveDown();
  doc.fontSize(16).fillColor(colors.text).text('Property Inspection Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).fillColor(colors.muted).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.text(`Total Issues Found: ${report.length}`, { align: 'center' });
  doc.moveDown(4);
  doc.fontSize(10).fillColor(colors.muted).text('This report was generated with AI assistance.', { align: 'center' });
  doc.addPage();

  // Summary
  doc.fontSize(20).fillColor(colors.text).text('Summary', 50, 50);
  doc.moveDown();

  const severityCounts = {
    critical: report.filter(r => r.severity === 'critical').length,
    moderate: report.filter(r => r.severity === 'moderate').length,
    minor: report.filter(r => r.severity === 'minor').length,
  };

  doc.fontSize(12);
  doc.fillColor(colors.critical).text(`Critical Issues: ${severityCounts.critical}`, 50, doc.y);
  doc.moveDown();
  doc.fillColor(colors.moderate).text(`Moderate Issues: ${severityCounts.moderate}`, 50, doc.y);
  doc.moveDown();
  doc.fillColor(colors.minor).text(`Minor Issues: ${severityCounts.minor}`, 50, doc.y);
  doc.moveDown(2);

  // Detailed Findings
  doc.fontSize(20).fillColor(colors.text).text('Detailed Findings', 50, doc.y);
  doc.moveDown();

  report.forEach((item, index) => {
    doc.fontSize(14).fillColor(colors.text).text(`${index + 1}. ${item.issue}`, 50, doc.y);
    doc.moveDown();
    doc.fontSize(11).fillColor(colors.muted).text(item.description, 50, doc.y, { width: 500 });
    doc.moveDown(2);
  });
}

const PORT = 3003;
server.listen(PORT, () => {
  console.log(`=== SERVER READY ===`);
  console.log(`Open: http://localhost:${PORT}/app.html`);
});
