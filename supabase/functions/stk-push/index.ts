import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const reply = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
  if (!user) return reply({ message: 'Please log in again.' }, 401);
  const { request_id } = await req.json();
  const { data: r }: any = await admin.from('requests').select('id, user_id, services(price), profiles(phone)').eq('id', request_id).single();
  if (!r || r.user_id !== user.id) return reply({ message: 'Request not found.' }, 404);
  const price = r.services?.price;
  if (!price) return reply({ message: 'Fee not set yet. We will message you.' }, 400);
  let p = String(r.profiles?.phone ?? '').replace(/\D/g, '');
  if (p.startsWith('0')) p = '254' + p.slice(1);
  else if (p.startsWith('7') || p.startsWith('1')) p = '254' + p;
  if (!/^254\d{9}$/.test(p)) return reply({ message: 'Your phone number looks wrong.' }, 400);

  const base = env('MPESA_ENV') === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const tok = await (await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: 'Basic ' + btoa(`${env('MPESA_KEY')}:${env('MPESA_SECRET')}`) },
  })).json();
  const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const sc = env('MPESA_SHORTCODE');
  const res = await (await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: sc, Password: btoa(sc + env('MPESA_PASSKEY') + ts), Timestamp: ts,
      TransactionType: env('MPESA_TYPE') || 'CustomerBuyGoodsOnline',
      Amount: price, PartyA: p, PartyB: env('MPESA_TILL') || sc, PhoneNumber: p,
      CallBackURL: `${env('SUPABASE_URL')}/functions/v1/mpesa-callback?k=${env('MPESA_CALLBACK_KEY')}`,
      AccountReference: 'Tribridge', TransactionDesc: 'Service fee',
    }),
  })).json();
  if (res.ResponseCode !== '0') return reply({ message: 'M-Pesa could not start the payment. Try again.' }, 502);
  await admin.from('payments').insert({ user_id: user.id, request_id, amount: price, phone: p, checkout_id: res.CheckoutRequestID });
  return reply({ message: 'Check your phone and enter your M-Pesa PIN.' });
});
