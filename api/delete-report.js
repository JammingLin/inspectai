export const config = { runtime: 'edge' };

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
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
    if (req.method !== 'DELETE') return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: HEADERS, status: 405 });

    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    if (!idToken) return new Response(JSON.stringify({ error: 'login_required' }), { headers: HEADERS, status: 401 });

    const user = parseGoogleToken(idToken);
    if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { headers: HEADERS, status: 401 });

    const { reportId } = await req.json();
    if (!reportId) return new Response(JSON.stringify({ error: 'reportId_required' }), { headers: HEADERS, status: 400 });

    const reportsKey = `reports:${user.sub}`;
    const existing = await kvGet(reportsKey);
    let reports = [];
    if (existing) {
      try { reports = JSON.parse(existing); } catch { reports = []; }
    }

    reports = reports.filter(r => r && r.id !== reportId);
    await kvSet(reportsKey, JSON.stringify(reports));

    return new Response(JSON.stringify({ success: true, reportId }), { headers: HEADERS, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to delete report', details: error.message }), { headers: HEADERS, status: 500 });
  }
}
