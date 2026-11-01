import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const reply = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
  const { data: me }: any = await admin.from('profiles').select('role').eq('id', user?.id ?? '').single();
  if (me?.role !== 'admin') return reply({ text: '' }, 403);
  const { title, body } = await req.json();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5', max_tokens: 600,
      system: 'You edit announcements for Kenyan KCSE leavers. Keep every fact, date and amount exactly as written. Use short, clear, friendly sentences in simple English. Reply with the announcement text only.',
      messages: [{ role: 'user', content: `Title: ${title}\n\n${body}` }],
    }),
  });
  const j = await r.json();
  return reply({ text: j.content?.[0]?.text ?? '' });
});
