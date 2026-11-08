import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const out = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

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
  if (from && !/mpesa/i.test(from)) return out({ ok: true, ignored: 'not from MPESA' });
  const code = text.match(/\b([A-Z0-9]{10})\s+Confirmed/i);
  const amt = text.match(/Ksh\.?\s?([\d,]+(?:\.\d+)?)/i);
  if (!code || !amt || !/received/i.test(text)) return out({ ok: true, ignored: 'not a payment received message' });
  const { error } = await admin.rpc('ingest_sms', { p_code: code[1].toUpperCase(), p_amount: parseFloat(amt[1].replace(/,/g, '')), p_sender: from.slice(0, 40), p_raw: text.slice(0, 400) });
  return out({ ok: !error, error: error?.message });
});
