// api/paypal-webhook.js
// PayPal Webhook 处理逻辑

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const event = req.body;
    console.log('PayPal Webhook received:', event.event_type);

    // 只处理订单完成事件
    if (event.event_type === 'CHECKOUT.ORDER.COMPLETED') {
      const order = event.resource;
      const customId = order.purchase_units?.[0]?.custom_id || '';
      // 解析 credits:数量:subId
      const parts = customId.split(':');
      if (parts.length >= 3) {
        const creditsToAdd = parseInt(parts[1]);
        const subId = parts[2];
        
        if (subId !== 'guest' && process.env.KV_REST_API_URL) {
           // 调用 KV 更新 credits... (逻辑同 capture)
        }
      }
    }

    return res.status(200).send('Webhook Received');
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).json({ error: err.message });
  }
}
