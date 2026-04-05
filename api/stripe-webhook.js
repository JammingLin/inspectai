// Vercel Serverless Function — Stripe Webhook Handler
// Handles subscription events: created, updated, deleted

export const config = {
  api: {
    bodyParser: false, // Must be raw for Stripe signature verification
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    // Verify webhook signature manually (no SDK)
    const event = await verifyStripeWebhook(rawBody, signature, STRIPE_WEBHOOK_SECRET);

    if (!event) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log('Stripe webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerEmail = session.customer_email || session.customer_details?.email;
        const subscriptionId = session.subscription;
        const plan = await getPlanFromSubscription(subscriptionId, STRIPE_SECRET_KEY);

        console.log(`✅ New subscription: ${customerEmail} → ${plan}`);
        // TODO: Save to database, update user quota
        // For now: log for manual tracking
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log(`🔄 Subscription updated: ${subscription.id} → ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log(`❌ Subscription cancelled: ${subscription.id}`);
        // TODO: Downgrade user to Free plan
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`💸 Payment failed: ${invoice.customer_email}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).json({ error: error.message });
  }
}

async function getPlanFromSubscription(subscriptionId, secretKey) {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { 'Authorization': `Bearer ${secretKey}` },
  });
  const sub = await response.json();
  const priceId = sub.items?.data?.[0]?.price?.id;

  const planMap = {
    [process.env.STRIPE_PRICE_PRO_MONTHLY]: 'pro_monthly',
    [process.env.STRIPE_PRICE_PRO_YEARLY]: 'pro_yearly',
    [process.env.STRIPE_PRICE_TEAM_MONTHLY]: 'team_monthly',
    [process.env.STRIPE_PRICE_TEAM_YEARLY]: 'team_yearly',
  };

  return planMap[priceId] || 'unknown';
}

// Manual Stripe webhook signature verification (no SDK)
async function verifyStripeWebhook(payload, signature, secret) {
  try {
    const parts = signature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {});

    const timestamp = parts['t'];
    const sig = parts['v1'];

    const signedPayload = `${timestamp}.${payload.toString()}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(signedPayload);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const expectedSig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (expectedSig !== sig) return null;

    // Check timestamp tolerance (5 minutes)
    const tolerance = 300;
    if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > tolerance) return null;

    return JSON.parse(payload.toString());
  } catch (e) {
    console.error('Signature verification error:', e);
    return null;
  }
}
