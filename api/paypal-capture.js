// api/paypal-capture.js
// 支付成功后确认订单、发放 credits

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
  const MODE = process.env.PAYPAL_MODE || 'live';
  const BASE = MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    const { orderId, userToken } = req.body;
    if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

    // 1. 获取 Access Token
    const tokenRes = await fetch(`${BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error('Failed to get PayPal token');

    // 2. Capture 订单
    const captureRes = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const capture = await captureRes.json();
    if (!captureRes.ok || capture.status !== 'COMPLETED') {
      throw new Error('Capture failed: ' + JSON.stringify(capture));
    }

    // 3. 从 custom_id 解析 credits 数量
    const customId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id || '';
    const creditsMatch = customId.match(/credits_(\d+)/);
    const creditsToAdd = creditsMatch ? parseInt(creditsMatch[1]) : 0;

    // 4. 发放 credits（如果有 userToken + KV 配置）
    let newCredits = null;
    if (userToken && creditsToAdd > 0 && process.env.KV_REST_API_URL) {
      try {
        // 解析用户 sub
        const [, payload] = userToken.split('.');
        const { sub } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        const creditsKey = `credits:${sub}`;

        // 读取现有 credits
        const kvGet = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent(creditsKey)}`, {
          headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
        });
        const kvData = await kvGet.json();
        const current = parseInt(kvData.result || '0');
        newCredits = current + creditsToAdd;

        // 写入新 credits（永不过期）
        await fetch(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent(creditsKey)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value: String(newCredits) }),
        });
      } catch (kvErr) {
        console.error('KV credits update failed:', kvErr);
        // 不影响支付成功响应，credits 可手动补
      }
    }

    return res.status(200).json({
      success: true,
      orderId,
      creditsAdded: creditsToAdd,
      newCredits,
      captureId: capture.purchase_units?.[0]?.payments?.captures?.[0]?.id,
    });

  } catch (err) {
    console.error('PayPal capture error:', err);
    return res.status(500).json({ error: err.message });
  }
}
