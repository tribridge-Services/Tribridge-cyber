import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const reply = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json' } });
const FAQ: [RegExp, string][] = [
  [/fee|price|cost|how much/i, 'Advice is always free. Services we apply for have a fee shown on the Apply button and in Services. Government fees are paid separately to the government.'],
  [/pay|mpesa|m-pesa|till|code/i, 'Open the service, tap Pay, send the amount by M-Pesa, then type the 10-character code from your M-Pesa message. Most payments are confirmed within minutes.'],
  [/password|email|recover|forgot|login|log in/i, 'We cannot recover your email or password. Please remember them or write them down before you continue.'],
  [/download|apk|install|app/i, 'You can use the website or download the Android app from the Home page. On the app, the bell icon shows your messages.'],
  [/upload|document|file|id|photo/i, 'Upload your documents under My account, then My documents. Clear photos or PDFs work best.'],
  [/analy|cluster|course|kuccps|points/i, 'The Course analyzer costs KES 100 for one analysis, one KCSE index number. Download your results within 30 minutes, because they disappear after that.'],
  [/welcome|hello|hi\b|hey/i, 'Hello! I am the Tribridge Bot. Ask me about payments, forms, documents or the app.'],
];
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
    if (!user) return reply({ ok: false, error: 'Please log in again.' });
    const { text } = await req.json();
    const q = String(text ?? '').trim().slice(0, 500);
    if (!q) return reply({ ok: false, error: 'Type a question.' });
    await admin.from('bot_chats').insert({ user_id: user.id, direction: 'in', body: q });
    const hit = FAQ.find(([re]) => re.test(q));
    const answer = hit ? hit[1] : null;
    if (answer) {
      await admin.from('bot_chats').insert({ user_id: user.id, direction: 'out', body: answer });
      return reply({ ok: true, answer, forward: false });
    }
    const unable = "I am not able to answer that one. Would you like me to send it to the Tribridge admin? Tap 'Send to admin' below.";
    await admin.from('bot_chats').insert({ user_id: user.id, direction: 'out', body: unable });
    return reply({ ok: true, answer: unable, forward: true, question: q });
  } catch (e) {
    return reply({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});
