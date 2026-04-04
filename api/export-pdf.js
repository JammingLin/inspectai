// Vercel Serverless Function - PDF Report Export
// Uses pdfkit to generate professional inspection reports

import PDFDocument from 'pdfkit';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/pdf',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers, status: 405 });
  }

  try {
    const { report, propertyInfo } = await req.json();
    
    if (!report || !Array.isArray(report)) {
      return new Response(JSON.stringify({ error: 'Invalid report data' }), { headers, status: 400 });
    }
    
    const info = propertyInfo || {
      address: 'Not specified',
      inspectorName: 'Not specified',
      inspectionDate: new Date().toLocaleDateString()
    };

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    // Collect PDF data
    const chunks = [];
    
    await new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', resolve);
      doc.on('error', reject);
      
      // Generate content
      generateReport(doc, report, info);
      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);

    return new Response(pdfBuffer, {
      headers: {
        ...headers,
        'Content-Disposition': `attachment; filename="inspection-report-${Date.now()}.pdf"`,
      },
      status: 200,
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return new Response(JSON.stringify({ 
      error: 'PDF generation failed',
      message: error.message 
    }), { headers, status: 500 });
  }
}

function generateReport(doc, report, propertyInfo) {
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
  doc.moveDown(3);
  
  // Property Information
  doc.fontSize(12).fillColor(colors.text).text(`Property Address: ${propertyInfo.address || 'Not specified'}`, 50, doc.y, { align: 'center' });
  doc.moveDown();
  doc.text(`Inspector: ${propertyInfo.inspectorName || 'Not specified'}`, { align: 'center' });
  doc.text(`Inspection Date: ${propertyInfo.inspectionDate ? new Date(propertyInfo.inspectionDate).toLocaleDateString() : 'Not specified'}`, { align: 'center' });
  
  doc.moveDown(2);
  doc.fontSize(10).fillColor(colors.muted).text(`Report Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.text(`Total Issues Found: ${report.length}`, { align: 'center' });
  doc.moveDown(4);
  doc.fontSize(10).fillColor(colors.muted).text('This report was generated with AI assistance.', { align: 'center' });
  doc.text('All findings should be verified by a qualified home inspector.', { align: 'center' });
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
  doc.fillColor(colors.critical).text(`• Critical Issues: ${severityCounts.critical}`, 50, doc.y, { indent: 20 });
  doc.fillColor(colors.moderate).text(`• Moderate Issues: ${severityCounts.moderate}`, 50, doc.y, { indent: 20 });
  doc.fillColor(colors.minor).text(`• Minor Issues: ${severityCounts.minor}`, 50, doc.y, { indent: 20 });
  doc.moveDown();

  // Detailed Findings
  doc.fontSize(20).fillColor(colors.text).text('Detailed Findings', 50, doc.y);
  doc.moveDown();

  report.forEach((item, index) => {
    const startY = doc.y;
    
    // Issue number and severity badge
    const severityColor = colors[item.severity] || colors.moderate;
    doc.fontSize(10).fillColor(severityColor).text(item.severity.toUpperCase(), 50, startY, { width: 80, align: 'right' });
    
    // Issue title
    doc.fontSize(14).fillColor(colors.text).text(item.issue, 140, startY, { width: 450 });
    
    // Location (if available)
    if (item.location) {
      doc.fontSize(10).fillColor(colors.muted).text(`Location: ${item.location}`, 140, doc.y);
    }
    
    // Description
    doc.fontSize(11).fillColor(colors.muted).text(item.description, 140, doc.y, { width: 450, indent: 0 });
    
    // Recommendation
    if (item.recommendation) {
      doc.fontSize(10).fillColor(colors.primary).text(`Recommendation: ${item.recommendation}`, 140, doc.y);
    }
    
    // Confidence
    doc.fontSize(9).fillColor(colors.muted).text(`Confidence: ${Math.round(item.confidence * 100)}%`, 140, doc.y);
    
    doc.moveDown(2);
    
    // Add page break if needed
    if (doc.y > 700 && index < report.length - 1) {
      doc.addPage();
    }
  });

  // Footer
  doc.fontSize(8).fillColor(colors.muted).text(
    '© 2026 InspectAI. This report is for informational purposes only.',
    50,
    doc.page.height - 30,
    { align: 'center', width: doc.page.width - 100 }
  );
}
