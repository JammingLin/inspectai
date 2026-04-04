// Vercel Serverless Function - Load Report from Cloud Storage
// Uses Vercel Blob for storage

import { list } from '@vercel/blob';

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers, status: 405 });
  }

  try {
    // List all reports
    const { blobs } = await list({ prefix: 'reports/' });
    
    const reports = await Promise.all(blobs.map(async (blob) => {
      try {
        const response = await fetch(blob.url);
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Failed to load report:', blob.pathname, error);
        return null;
      }
    }));
    
    const validReports = reports.filter(r => r !== null);

    return new Response(JSON.stringify({ reports: validReports }), { headers, status: 200 });
  } catch (error) {
    console.error('List reports error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to list reports',
      details: error.message 
    }), { headers, status: 500 });
  }
}
