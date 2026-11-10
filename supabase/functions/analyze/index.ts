import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const reply = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json' } });
const PTS: Record<string, number> = { A: 12, 'A-': 11, 'B+': 10, B: 9, 'B-': 8, 'C+': 7, C: 6, 'C-': 5, 'D+': 4, D: 3, 'D-': 2, E: 1 };
const norm = (s: string) => String(s).trim().toLowerCase();

function score(req: string, pts: { name: string; pts: number }[], t: number): number | null {
  const slots = String(req).split(';').map((s) => {
    const [o, g] = s.split(':');
    return { opts: o.split('/').map(norm), min: PTS[(g || '').trim()] || 0 };
  }).sort((x, y) => (x.opts.includes('*') ? 99 : x.opts.length) - (y.opts.includes('*') ? 99 : y.opts.length));
  const used = new Set<number>();
  let r = 0;
  for (const s of slots) {
    let bi = -1;
    pts.forEach((g, i) => {
      if (!used.has(i) && g.pts >= s.min && (s.opts.includes('*') || s.opts.includes(norm(g.name))) && (bi < 0 || g.pts > pts[bi].pts)) bi = i;
    });
    if (bi < 0) return null;
    used.add(bi);
    r += pts[bi].pts;
  }
  return Math.sqrt((r / 48) * (t / 84)) * 48;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let uid = '';
  let charged = false;
  try {
    const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
    if (!user) return reply({ ok: false, error: 'Please log in again.' });
    uid = user.id;
    const input = await req.json();
    const grades: any[] = Array.isArray(input.grades) ? input.grades : [];
    const idx = String(input.index_no ?? '').trim();
    if (grades.length < 7 || grades.length > 16 || grades.some((g) => PTS[g.g] === undefined)) return reply({ ok: false, error: 'Add at least 7 subjects with valid grades.' });
    if (!/^[0-9]{6,12}(\/[0-9]{4})?$/.test(idx)) return reply({ ok: false, error: 'Type your KCSE index number, for example 12345678/2025.' });
    const { data: me }: any = await admin.from('profiles').select('role').eq('id', uid).single();
    if (me?.role !== 'admin') {
      const { data: ok } = await admin.rpc('consume_credit', { uid });
      if (!ok) return reply({ ok: false, error: 'No analysis left. Pay again to run it again.' });
      charged = true;
    }
    const pts = grades.map((g) => ({ name: String(g.name), pts: PTS[g.g] }));
    const t = pts.map((x) => x.pts).sort((a, b) => b - a).slice(0, 7).reduce((a, b) => a + b, 0);
    const four = grades.filter((g) => g.c);
    const cl = four.length === 4 ? Math.sqrt((four.reduce((a, g) => a + PTS[g.g], 0) / 48) * (t / 84)) * 48 : null;
    let all: any[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await admin.from('programmes').select('programme, institution, req, cutoff').range(from, from + 999);
      if (error) throw error;
      all = all.concat(data ?? []);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    const courses = all.map((p) => {
      const s = score(p.req, pts, t);
      return s === null ? null : { programme: p.programme, institution: p.institution, cutoff: Number(p.cutoff), score: Math.round(s * 100) / 100, diff: Math.round((s - Number(p.cutoff)) * 100) / 100 };
    }).filter((c: any) => c && c.diff >= -2).sort((a: any, b: any) => b.cutoff - a.cutoff).slice(0, 400);
    const summary = { grades: grades.map((g) => ({ name: g.name, g: g.g })), total: t, cluster: cl === null ? null : cl.toFixed(2), index_no: idx };
    const { data: saved, error: e2 } = await admin.from('calc_results').insert({ user_id: uid, summary, courses }).select('expires_at').single();
    if (e2) throw e2;
    await admin.from('calc_results').delete().lt('expires_at', new Date().toISOString());
    return reply({ ok: true, summary, courses, expires_at: saved.expires_at });
  } catch (e) {
    if (charged) await admin.rpc('refund_credit', { uid });
    return reply({ ok: false, error: 'Could not run the analysis. You were not charged. ' + String((e as Error)?.message ?? e) });
  }
});
