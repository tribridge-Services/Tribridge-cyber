import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const out = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const log = (sender: string, outcome: string) => admin.rpc('log_sms', { p_sender: sender.slice(0, 40), p_outcome: outcome });

Deno.serve(async (req) => {
  if (new URL(req.url).searchParams.get('k') !== Deno.env.get('SMS_WEBHOOK_KEY')) return out({ ok: false }, 401);
  let from = '';
  let text = '';
  try {
    if ((req.headers.get('content-type') ?? '').includes('json')) {
      const j: any = await req.json();
      from = String(j.from ?? j.sender ?? j.address ?? '');
      text = String(j.text ?? j.message ?? j.body ?? '');
    } else {
      const f = new URLSearchParams(await req.text());
      from = f.get('from') ?? f.get('sender') ?? '';
      text = f.get('text') ?? f.get('message') ?? f.get('body') ?? '';
    }
  } catch (_e) {
    return out({ ok: false, error: 'Bad body' }, 400);
  }
  if (!text) { await log(from, 'test or empty message'); return out({ ok: true, ignored: 'empty' }); }
  if (from && !/m-?pesa/i.test(from)) { await log(from, 'ignored: sender is not MPESA'); return out({ ok: true, ignored: 'not from MPESA' }); }
  const code = text.match(/\b([A-Z0-9]{10})\s+Confirmed/i);
  const amt = text.match(/Ksh\.?\s?([\d,]+(?:\.\d+)?)/i);
  if (!code || !amt || !/received/i.test(text)) { await log(from, 'ignored: not a payment received message'); return out({ ok: true, ignored: 'not a payment received message' }); }
  const c = code[1].toUpperCase();
  const { error } = await admin.rpc('ingest_sms', { p_code: c, p_amount: parseFloat(amt[1].replace(/,/g, '')), p_sender: from.slice(0, 40), p_raw: text.slice(0, 400) });
  await log(from, error ? 'error: ' + error.message : 'recorded ' + c);
  return out({ ok: !error, error: error?.message });
});
