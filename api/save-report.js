// Vercel Serverless Function - Save Report to Browser Storage
// Uses client-side IndexedDB via API proxy

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
    const { report, propertyInfo, reportId } = await req.json();
    
    if (!report || !Array.isArray(report)) {
      return new Response(JSON.stringify({ error: 'Invalid report data' }), { headers, status: 400 });
    }

    // Generate a unique report ID if not provided
    const id = reportId || `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create report data object
    const reportData = {
      id,
      createdAt: new Date().toISOString(),
      propertyInfo,
      findings: report,
      totalIssues: report.length,
      severityCounts: {
        critical: report.filter(r => r.severity === 'critical').length,
        moderate: report.filter(r => r.severity === 'moderate').length,
        minor: report.filter(r => r.severity === 'minor').length,
      }
    };

    // For now, just return the report data
    // Client will save to IndexedDB
    // Future: integrate with actual cloud storage

    return new Response(JSON.stringify({ 
      success: true, 
      reportId: id,
      data: reportData
    }), { headers, status: 200 });
  } catch (error) {
    console.error('Save report error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to save report',
      details: error.message 
    }), { headers, status: 500 });
  }
}
