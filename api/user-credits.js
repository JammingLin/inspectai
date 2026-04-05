// api/user-credits.js
// 查询、初始化、扣减用户 credits
// 使用 Vercel KV (Edge-compatible) 存储

export const config = { runtime: 'edge' };

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const FREE_CREDITS = 3; // 新用户赠送额度

// ---- KV helpers (Vercel KV REST API) ----
async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value: String(value) }),
  });
}

// ---- JWT verification (Google ID token) ----
async function verifyGoogleToken(idToken) {
  try {
    // Decode without full verification (edge-friendly; for production add JWKS check)
    const [, payload] = idToken.split('.');
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!decoded.sub || !decoded.email) return null;
    return { sub: decoded.sub, email: decoded.email, name: decoded.name };
  } catch {
    return null;
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: HEADERS, status: 200 });

  // Auth
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.replace('Bearer ', '').trim();
  if (!idToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: HEADERS, status: 401 });
  }

  const user = await verifyGoogleToken(idToken);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { headers: HEADERS, status: 401 });
  }

  const creditsKey = `credits:${user.sub}`;
  const initKey = `init:${user.email}`; // email维度去重，防小号

  // GET — 查询 credits
  if (req.method === 'GET') {
    let credits = await kvGet(creditsKey);
    if (credits === null) {
      // 新用户：检查邮箱是否已领过（防止同邮箱多账号）
      const alreadyInit = await kvGet(initKey);
      if (!alreadyInit) {
        await kvSet(creditsKey, FREE_CREDITS);
        await kvSet(initKey, '1');
        credits = FREE_CREDITS;
      } else {
        credits = 0;
      }
    }
    return new Response(JSON.stringify({ credits: Number(credits), email: user.email }), { headers: HEADERS, status: 200 });
  }

  // POST — 扣减1 credit（分析前调用）
  if (req.method === 'POST') {
    let credits = await kvGet(creditsKey);
    credits = credits !== null ? Number(credits) : 0;

    if (credits <= 0) {
      return new Response(JSON.stringify({ error: 'No credits remaining', credits: 0 }), { headers: HEADERS, status: 402 });
    }

    await kvSet(creditsKey, credits - 1);
    return new Response(JSON.stringify({ credits: credits - 1, used: 1 }), { headers: HEADERS, status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: HEADERS, status: 405 });
}
