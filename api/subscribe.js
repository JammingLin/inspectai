// Vercel Serverless Function — Mailchimp Integration
// InspectAI Waitlist Subscription

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers, status: 405 }
    );
  }

  try {
    const { email } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Valid email required' }),
        { headers, status: 400 }
      );
    }

    // Mailchimp config (same as ForensIQ, separate audience if needed)
    const MAILCHIMP_API_KEY = 'YOUR_MAILCHIMP_API_KEY'; // TODO: Set in Vercel env
    const MAILCHIMP_DC = 'us20'; // Same datacenter
    const MAILCHIMP_AUDIENCE_ID = 'inspectai_audience_id'; // TODO: Create separate audience

    const [_, dc] = MAILCHIMP_API_KEY.split('-');
    const url = `https://${dc}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `apikey ${MAILCHIMP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
        merge_fields: {
          FNAME: 'Inspector',
          SOURCE: 'inspectai-landing',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      if (error.status === 400 && error.title === 'Member Exists') {
        return new Response(
          JSON.stringify({ error: 'Email already subscribed' }),
          { headers, status: 400 }
        );
      }
      throw new Error(error.detail || 'Mailchimp error');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Subscribed successfully' }),
      { headers, status: 200 }
    );
  } catch (error) {
    console.error('Subscription error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers, status: 500 }
    );
  }
}
