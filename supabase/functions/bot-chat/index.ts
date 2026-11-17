import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const reply = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json' } });
const SORRY = "I'm not able to answer that. Would you like me to forward your question to the admin?";
const FAQ = `Tribridge Cyber helps Kenyan KCSE leavers online. We never meet students in person.
HOW IT WORKS: open Services, choose a service, pick Live help (cheaper, we guide you while you do it) or Done for you, fill the form, tick the consent boxes and apply. Upload documents under My account, My documents. Pay first by M-Pesa to the number shown on your request, then type the M-Pesa code on the request. We start when the payment is confirmed. Follow progress under My requests and in the request chat. Official government fees are paid separately to the agency.
COURSE ANALYZER: one payment gives one analysis for one KCSE index number. Results can be downloaded and disappear 30 minutes after the run, then the student pays again.
ACCOUNT: we cannot recover emails or passwords. Students must remember or write them down. Names go in the same order as on the ID. Edit details under My account.
MESSAGES: the bell icon shows updates and announcements. Android app can be downloaded from the website.
PRIVACY: details and documents are used only to help the student, staff can read them, see the Privacy Policy page.`;
const rules = (m: string, svcs: any[]) => {
  const t = m.toLowerCase() + ' ';
  const s = svcs.find((x) => x.title.toLowerCase().split(/[ /(),-]+/).some((w: string) => w.length > 3 && t.includes(w)));
  if (/password|forgot|recover/.test(t)) return 'We cannot recover your email or password, so remember them or write them down.';
  if (s) return `${s.title}: ${s.description} ${s.free ? 'This is free.' : 'Price: KES ' + (s.price_full ?? 'to be confirmed') + (s.price_live ? ' or live help KES ' + s.price_live : '') + '.'}`;
  if (/pay|mpesa|m-pesa|price|cost|fee|how much/.test(t)) return 'You pay first by M-Pesa to the number shown on your request, then type the M-Pesa code on the request. Prices are on the Services page.';
  if (/download|install|apk/.test(t)) return 'Download the Android app from our website, then allow the install when your phone asks.';
  if (/analy|cluster|course finder|points/.test(t)) return 'The Course analyzer gives one analysis for one KCSE index number. Download your results within 30 minutes or they disappear and you pay again.';
  if (/^(hi|hello|hey|habari)\b/.test(t)) return 'Hello! Ask me about our services, prices, payments or how the app works.';
  return 'ESCALATE';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
    if (!user) return reply({ ok: false, error: 'Please log in again.' });
    const msg = String((await req.json()).message ?? '').trim().slice(0, 500);
    if (!msg) return reply({ ok: false, error: 'Type a question.' });
    const since = new Date(Date.now() - 3600000).toISOString();
    const { count } = await admin.from('bot_chats').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('role', 'user').gte('created_at', since);
    if ((count ?? 0) >= 30) return reply({ ok: false, error: 'You have asked many questions. Please try again later.' });
    const { data: q } = await admin.from('bot_chats').insert({ user_id: user.id, role: 'user', body: msg }).select('id').single();
    const { data: svcs }: any = await admin.from('services').select('title, description, free, price_live, price_full');
    let answer = '';
    const key = env('ANTHROPIC_API_KEY');
    if (key) {
      try {
        const { data: hist }: any = await admin.from('bot_chats').select('role, body').eq('user_id', user.id).order('created_at', { ascending: false }).limit(6);
        const talk = (hist ?? []).reverse().map((h: any) => `${h.role}: ${h.body}`).join('\n');
        const kb = FAQ + '\nSERVICES:\n' + (svcs ?? []).map((s: any) => `- ${s.title}: ${s.description} ${s.free ? 'Free.' : 'Done for you KES ' + (s.price_full ?? '?') + (s.price_live ? ', live help KES ' + s.price_live : '')}`).join('\n');
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-5-5', max_tokens: 400,
            system: 'You are the Tribridge Bot for Tribridge Cyber. Answer only about the app, services, prices, payments, documents and process, in short simple English, using only the information below. If the question is unrelated, needs a human, or you are not sure, reply with exactly: ESCALATE. Never ask for passwords, PINs or one-time codes.\n\n' + kb,
            messages: [{ role: 'user', content: 'Recent chat:\n' + talk + '\n\nAnswer the last user message.' }],
          }),
        });
        answer = (await r.json()).content?.[0]?.text ?? '';
      } catch (_e) { answer = ''; }
    }
    if (!answer) answer = rules(msg, svcs ?? []);
    const esc = answer.includes('ESCALATE');
    await admin.from('bot_chats').insert({ user_id: user.id, role: 'bot', body: esc ? SORRY : answer.trim() });
    return reply({ ok: true, canForward: esc, question_id: q?.id });
  } catch (e) {
    return reply({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});
