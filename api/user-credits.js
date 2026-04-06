// api/user-credits.js
export const config = { runtime: 'edge' };

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

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

function verifyGoogleToken(idToken) {
  try {
    const [, payload] = idToken.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return (decoded.sub && decoded.email) ? { sub: decoded.sub, email: decoded.email } : null;
  } catch { return null; }
}

export default async function handler(req) {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { headers: HEADERS, status: 200 });

    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    if (!idToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: HEADERS, status: 401 });

    const user = verifyGoogleToken(idToken);
    if (!user) return new Response(JSON.stringify({ error: 'Invalid token' }), { headers: HEADERS, status: 401 });

    // --- TEST USER WHITELIST (Force Unlimited) ---
    if (user.email === 'arvilinam@gmail.com') {
      if (req.method === 'GET') return new Response(JSON.stringify({ credits: 9999, email: user.email }), { headers: HEADERS, status: 200 });
      if (req.method === 'POST') return new Response(JSON.stringify({ credits: 9999, used: 0 }), { headers: HEADERS, status: 200 });
    }

    const creditsKey = `credits:${user.sub}`;
    const initKey = `init:${user.email}`;

    if (req.method === 'GET') {
      let credits = await kvGet(creditsKey);
      if (credits === null) {
        const alreadyInit = await kvGet(initKey);
        if (!alreadyInit) {
          await kvSet(creditsKey, 3);
          await kvSet(initKey, '1');
          credits = 3;
        } else {
          credits = 0;
        }
      }
      return new Response(JSON.stringify({ credits: Number(credits), email: user.email }), { headers: HEADERS, status: 200 });
    }

    if (req.method === 'POST') {
      let credits = await kvGet(creditsKey);
      credits = credits !== null ? Number(credits) : 0;
      if (credits <= 0) return new Response(JSON.stringify({ error: 'No credits remaining', credits: 0 }), { headers: HEADERS, status: 402 });
      await kvSet(creditsKey, credits - 1);
      return new Response(JSON.stringify({ credits: credits - 1, used: 1 }), { headers: HEADERS, status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: HEADERS, status: 405 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', details: err.message }), { headers: HEADERS, status: 500 });
  }
}
