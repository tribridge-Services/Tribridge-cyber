import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const reply = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const b64 = (x: string | Uint8Array) => btoa(typeof x === 'string' ? x : String.fromCharCode(...x)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken(sa: any) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${claim}.${b64(sig)}`,
  });
  return (await r.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
  if (!user) return reply({ ok: false }, 401);
  const input = await req.json();
  const { data: me }: any = await admin.from('profiles').select('role').eq('id', user.id).single();
  let title = '', body = '', ids: string[] | null = null;
  if (input.kind === 'announcement' && me?.role === 'admin') {
    title = String(input.title ?? 'Tribridge Cyber');
    body = String(input.body ?? '').slice(0, 180);
  } else if (input.kind === 'request') {
    const { data: r }: any = await admin.from('requests').select('user_id, services(title)').eq('id', input.request_id).single();
    if (!r || r.user_id !== user.id) return reply({ ok: false }, 403);
    title = 'New request';
    body = r.services?.title ?? 'A student applied';
    const { data: a }: any = await admin.from('profiles').select('id').eq('role', 'admin');
    ids = (a ?? []).map((x: any) => x.id);
  } else return reply({ ok: false }, 400);
  let q: any = admin.from('push_tokens').select('token');
  if (ids) q = q.in('user_id', ids);
  const { data: toks }: any = await q;
  const sa = JSON.parse(env('FCM_SERVICE_ACCOUNT'));
  const at = await accessToken(sa);
  await Promise.all((toks ?? []).map(async ({ token }: any) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, notification: { title, body }, android: { priority: 'HIGH' } } }),
    });
    if (res.status === 404) await admin.from('push_tokens').delete().eq('token', token);
  }));
  return reply({ ok: true, sent: (toks ?? []).length });
});
