// Vercel Serverless Function — Stripe Checkout Session
// InspectAI Subscription Checkout

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, userEmail } = req.body;

    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    // Price IDs — set these in Stripe Dashboard then add to Vercel env
    const PRICE_IDS = {
      pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,   // $39/mo
      pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,     // $390/yr
      team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY, // $89/mo
      team_yearly: process.env.STRIPE_PRICE_TEAM_YEARLY,   // $890/yr
    };

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://inspectai.cc';

    // Call Stripe API directly (no SDK to keep bundle small)
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': `${BASE_URL}/app?subscription=success`,
        'cancel_url': `${BASE_URL}/pricing?cancelled=true`,
        ...(userEmail ? { 'customer_email': userEmail } : {}),
        'allow_promotion_codes': 'true',
        'billing_address_collection': 'auto',
        'subscription_data[trial_period_days]': '7', // 7-day free trial
      }),
    });

    const session = await response.json();

    if (!response.ok) {
      console.error('Stripe error:', session);
      return res.status(500).json({ error: session.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
