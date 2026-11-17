import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const reply = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
    const { data: me }: any = await admin.from('profiles').select('role').eq('id', user?.id ?? '').single();
    if (me?.role !== 'admin') return reply({ text: '', error: 'Admins only.' });
    const { title, body } = await req.json();
    const key = env('GEMINI_API_KEY');
    if (!key) return reply({ text: '', error: 'The GEMINI_API_KEY secret is not set in Supabase.' });
    const model = env('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'You edit announcements for Kenyan KCSE leavers. Keep every fact, date and amount exactly as written. Use short, clear, friendly sentences in simple English. Reply with the announcement text only, no preamble.' }] },
        contents: [{ role: 'user', parts: [{ text: `Title: ${title}\n\n${body}` }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
      }),
    });
    const j: any = await r.json();
    if (!r.ok) return reply({ text: '', error: j?.error?.message || `Gemini error ${r.status}` });
    const text = j?.candidates?.[0]?.content?.parts?.map((x: any) => x.text ?? '').join('').trim() ?? '';
    if (!text) return reply({ text: '', error: 'Gemini returned no text. Try again.' });
    return reply({ text });
  } catch (e) {
    return reply({ text: '', error: String((e as Error)?.message ?? e) });
  }
});
