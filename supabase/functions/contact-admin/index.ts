import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'clanmccord@hotmail.com';
const MAX = { name: 100, sender_email: 254, subject: 200, message: 5000 };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return response({ error: 'Authentication required' }, 401);

  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return response({ error: 'Invalid request body' }, 400); }
  const values = Object.fromEntries(Object.keys(MAX).map((key) => [key, String(input[key] || '').trim()])) as Record<keyof typeof MAX, string>;
  if (Object.values(values).some((value) => !value)) return response({ error: 'All fields are required' }, 400);
  if (!emailPattern.test(values.sender_email)) return response({ error: 'Invalid sender email' }, 400);
  if (Object.entries(MAX).some(([key, limit]) => values[key as keyof typeof MAX].length > limit)) return response({ error: 'A field exceeds its maximum length' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const createdAt = new Date().toISOString();
  const { data: stored, error: storeError } = await admin.from('contact_messages').insert({
    user_id: user.id, name: values.name, sender_email: values.sender_email,
    subject: values.subject, message: values.message, delivery_status: 'pending', created_at: createdAt,
  }).select('id').single();
  if (storeError || !stored) return response({ error: 'Message could not be stored' }, 500);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('CONTACT_FROM_EMAIL');
  if (!resendKey || !from) {
    await admin.from('contact_messages').update({ delivery_status: 'pending_configuration' }).eq('id', stored.id);
    return response({ accepted: true, delivered: false }, 202);
  }

  const delivery = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [ADMIN_EMAIL], reply_to: values.sender_email, subject: `[Nutrition Tracker] ${values.subject}`, text: `From: ${values.name} <${values.sender_email}>\nUser ID: ${user.id}\nSubmitted: ${createdAt}\n\n${values.message}` }),
  });
  const deliveryStatus = delivery.ok ? 'delivered' : `failed_${delivery.status}`;
  await admin.from('contact_messages').update({ delivery_status: deliveryStatus }).eq('id', stored.id);
  if (!delivery.ok) return response({ accepted: true, delivered: false }, 202);
  return response({ accepted: true, delivered: true });
});
