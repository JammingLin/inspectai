// api/paypal-create-order.js
// 创建 PayPal 订单（积分包 + 订阅均用此接口）
// runtime: nodejs (需要 Buffer)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
  const MODE = process.env.PAYPAL_MODE || 'live';
  const BASE = MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'PayPal not configured' });
  }

  try {
    const { pack } = req.body; // 'starter' | 'standard' | 'pro'

    const PACKS = {
      starter:  { amount: '9.00',  credits: 10, label: 'InspectAI Starter Pack — 10 Credits' },
      standard: { amount: '19.00', credits: 25, label: 'InspectAI Standard Pack — 25 Credits' },
      pro:      { amount: '39.00', credits: 60, label: 'InspectAI Pro Pack — 60 Credits' },
    };

    const item = PACKS[pack];
    if (!item) return res.status(400).json({ error: 'Invalid pack' });

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
    if (!accessToken) throw new Error('Failed to get PayPal token: ' + JSON.stringify(tokenData));

    // 2. 创建订单
    const orderRes = await fetch(`${BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `inspectai-${pack}-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: item.amount },
          description: item.label,
          // 格式：credits:数量:subId
          custom_id: `credits_${item.credits}:${req.headers['x-user-sub'] || 'guest'}`,
        }],
        application_context: {
          brand_name: 'InspectAI',
          landing_page: 'BILLING',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: 'https://inspectai.cc/app?payment=success',
          cancel_url: 'https://inspectai.cc/pricing?cancelled=true',
        },
      }),
    });

    const order = await orderRes.json();
    if (!orderRes.ok) throw new Error('PayPal order failed: ' + JSON.stringify(order));

    // 找到跳转链接
    const approveUrl = order.links?.find(l => l.rel === 'approve')?.href;
    return res.status(200).json({ orderId: order.id, approveUrl });

  } catch (err) {
    console.error('PayPal create order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
