export const config = { runtime: 'edge' };

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function parseGoogleToken(idToken) {
  try {
    const [, payload] = idToken.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.sub ? { sub: decoded.sub, email: decoded.email } : null;
  } catch {
    return null;
  }
}

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

export default async function handler(req) {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { headers: HEADERS, status: 200 });
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: HEADERS, status: 405 });

    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    if (!idToken) return new Response(JSON.stringify({ error: 'login_required' }), { headers: HEADERS, status: 401 });

    const user = parseGoogleToken(idToken);
    if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { headers: HEADERS, status: 401 });

    const { report, propertyInfo, reportId } = await req.json();
    const findings = report?.findings || report?.items || report;
    if (!findings || !Array.isArray(findings)) {
      return new Response(JSON.stringify({ error: 'Invalid report data' }), { headers: HEADERS, status: 400 });
    }

    const id = reportId || report?.id || `report-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const reportData = {
      id,
      userId: user.sub,
      userEmail: user.email,
      createdAt: report?.createdAt || new Date().toISOString(),
      propertyInfo: propertyInfo || report?.propertyInfo || {},
      findings,
      totalIssues: findings.length,
      severityCounts: {
        critical: findings.filter(r => r.severity === 'critical').length,
        moderate: findings.filter(r => r.severity === 'moderate').length,
        minor: findings.filter(r => r.severity === 'minor').length,
      }
    };

    const reportsKey = `reports:${user.sub}`;
    const existing = await kvGet(reportsKey);
    let reports = [];
    if (existing) {
      try { reports = JSON.parse(existing); } catch { reports = []; }
    }

    reports = reports.filter(r => r && r.id !== id);
    reports.unshift(reportData);
    reports = reports.slice(0, 100);

    await kvSet(reportsKey, JSON.stringify(reports));

    return new Response(JSON.stringify({ success: true, reportId: id, data: reportData }), { headers: HEADERS, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to save report', details: error.message }), { headers: HEADERS, status: 500 });
  }
}
