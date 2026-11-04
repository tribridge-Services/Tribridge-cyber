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
  const j = await r.json();
  if (!j.access_token) throw new Error('Google sign-in failed: ' + (j.error_description || j.error || 'unknown'));
  return j.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
    if (!user) return reply({ ok: false, error: 'Please log in again.' });
    const input = await req.json();
    const { data: me }: any = await admin.from('profiles').select('role').eq('id', user.id).single();
    const admins = async () => ((await admin.from('profiles').select('id').eq('role', 'admin')).data ?? []).map((x: any) => x.id);
    let title = '', body = '', ids: string[] | null = null;
    if (input.kind === 'test') {
      title = 'Test notification';
      body = 'If you see this, notifications work on this phone.';
      ids = [user.id];
    } else if (input.kind === 'announcement' && me?.role === 'admin') {
      title = String(input.title ?? 'Tribridge Cyber');
      body = String(input.body ?? '').slice(0, 180);
    } else if (input.kind === 'request' || input.kind === 'payment') {
      const { data: r }: any = await admin.from('requests').select('user_id, services(title)').eq('id', input.request_id).single();
      if (!r || r.user_id !== user.id) return reply({ ok: false, error: 'Not allowed.' });
      title = input.kind === 'payment' ? 'Payment to approve' : 'New request';
      body = r.services?.title ?? 'A student applied';
      ids = await admins();
    } else if (input.kind === 'calc') {
      title = 'Payment to approve';
      body = 'Course analyzer';
      ids = await admins();
    } else return reply({ ok: false, error: 'Not allowed.' });
    let q: any = admin.from('push_tokens').select('token');
    if (ids) q = q.in('user_id', ids);
    const { data: toks }: any = await q;
    if (!toks || toks.length === 0) return reply({ ok: true, sent: 0, total: 0, errors: ['No phone has registered for notifications yet.'] });
    let sa: any;
    try { sa = JSON.parse(env('FCM_SERVICE_ACCOUNT')); } catch (_e) { return reply({ ok: false, error: 'The FCM_SERVICE_ACCOUNT secret is missing or is not valid JSON.' }); }
    const at = await accessToken(sa);
    let sent = 0;
    const errors: string[] = [];
    await Promise.all(toks.map(async ({ token }: any) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, notification: { title, body }, android: { priority: 'HIGH' } } }),
      });
      if (res.ok) sent++;
      else {
        const j: any = await res.json().catch(() => ({}));
        errors.push(`${res.status}: ${j?.error?.message ?? 'FCM error'}`);
        if (res.status === 404) await admin.from('push_tokens').delete().eq('token', token);
      }
    }));
    return reply({ ok: true, sent, total: toks.length, errors: errors.slice(0, 3) });
  } catch (e) {
    return reply({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});
