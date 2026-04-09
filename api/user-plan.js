export const config = { runtime: 'edge' };

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    if (!idToken) return new Response(JSON.stringify({ error: 'login_required' }), { headers: HEADERS, status: 401 });

    const user = parseGoogleToken(idToken);
    if (!user) return new Response(JSON.stringify({ error: 'invalid_token' }), { headers: HEADERS, status: 401 });

    const key = `plan:${user.sub}`;

    if (req.method === 'GET') {
      const plan = await kvGet(key);
      return new Response(JSON.stringify({ plan: plan || 'free', email: user.email }), { headers: HEADERS, status: 200 });
    }

    if (req.method === 'POST') {
      const { plan } = await req.json();
      const allowed = ['free', 'pro', 'team'];
      if (!allowed.includes(plan)) {
        return new Response(JSON.stringify({ error: 'invalid_plan' }), { headers: HEADERS, status: 400 });
      }
      await kvSet(key, plan);
      return new Response(JSON.stringify({ success: true, plan }), { headers: HEADERS, status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: HEADERS, status: 405 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'internal_error', details: error.message }), { headers: HEADERS, status: 500 });
  }
}
