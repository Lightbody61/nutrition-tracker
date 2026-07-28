import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'clanmccord@hotmail.com';
const MAX = { name: 100, sender_email: 254, subject: 200, message: 5000 };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedOrigins = new Set([
  'https://nutrition-tracker.jodydmccord.workers.dev',
  'https://lightbody61.github.io',
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin');
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://nutrition-tracker.jodydmccord.workers.dev',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

const cleanProviderError = (value: unknown) => String(value || 'Email provider rejected the request.').replace(/[\r\n]+/g, ' ').slice(0, 500);

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) return response(request, { ok: false, stored: false, delivered: false, error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return response(request, { ok: false, stored: false, delivered: false, error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!authorization.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceKey) {
    return response(request, { ok: false, stored: false, delivered: false, error: 'Authentication required.' }, 401);
  }
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return response(request, { ok: false, stored: false, delivered: false, error: 'Authentication required.' }, 401);

  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return response(request, { ok: false, stored: false, delivered: false, error: 'Invalid request body.' }, 400); }
  const values = Object.fromEntries(Object.keys(MAX).map((key) => [key, String(input[key] || '').trim()])) as Record<keyof typeof MAX, string>;
  if (Object.values(values).some((value) => !value)) return response(request, { ok: false, stored: false, delivered: false, error: 'All fields are required.' }, 400);
  if (!emailPattern.test(values.sender_email)) return response(request, { ok: false, stored: false, delivered: false, error: 'Invalid sender email.' }, 400);
  if (Object.entries(MAX).some(([key, limit]) => values[key as keyof typeof MAX].length > limit)) return response(request, { ok: false, stored: false, delivered: false, error: 'A field exceeds its maximum length.' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const createdAt = new Date().toISOString();
  const { data: stored, error: storeError } = await admin.from('contact_messages').insert({
    user_id: user.id, name: values.name, sender_email: values.sender_email,
    subject: values.subject, message: values.message, delivery_status: 'pending', created_at: createdAt,
  }).select('id').single();
  if (storeError || !stored) return response(request, { ok: false, stored: false, delivered: false, error: 'Message could not be stored.' }, 500);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('CONTACT_FROM_EMAIL');
  if (!resendKey || !from) {
    const error = 'Email delivery is not configured.';
    await admin.from('contact_messages').update({ delivery_status: 'pending_configuration', delivery_error: error }).eq('id', stored.id);
    return response(request, { ok: false, stored: true, delivered: false, error }, 503);
  }

  try {
    const delivery = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [ADMIN_EMAIL], reply_to: values.sender_email, subject: `[Nutrition Tracker] ${values.subject}`, text: `From: ${values.name} <${values.sender_email}>\nUser ID: ${user.id}\nSubmitted: ${createdAt}\n\n${values.message}` }),
    });
    let providerBody: Record<string, unknown> = {};
    try { providerBody = await delivery.json(); } catch { /* provider returned no JSON */ }
    if (!delivery.ok) {
      const error = cleanProviderError(providerBody.message || providerBody.error || `Email provider returned HTTP ${delivery.status}.`);
      await admin.from('contact_messages').update({ delivery_status: 'failed', delivery_error: error }).eq('id', stored.id);
      return response(request, { ok: false, stored: true, delivered: false, error: 'Email delivery failed.' }, 502);
    }
    const deliveredAt = new Date().toISOString();
    const update = await admin.from('contact_messages').update({ delivery_status: 'delivered', delivery_error: null, provider_message_id: typeof providerBody.id === 'string' ? providerBody.id : null, delivered_at: deliveredAt }).eq('id', stored.id);
    if (update.error) return response(request, { ok: false, stored: true, delivered: true, error: 'Delivery succeeded, but its status could not be recorded.' }, 500);
    return response(request, { ok: true, stored: true, delivered: true });
  } catch {
    const error = 'Email provider could not be reached.';
    await admin.from('contact_messages').update({ delivery_status: 'failed', delivery_error: error }).eq('id', stored.id);
    return response(request, { ok: false, stored: true, delivered: false, error: 'Email delivery failed.' }, 502);
  }
});
