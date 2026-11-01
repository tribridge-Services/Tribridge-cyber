import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

Deno.serve(async (req) => {
  if (new URL(req.url).searchParams.get('k') !== Deno.env.get('MPESA_CALLBACK_KEY')) return new Response('no', { status: 401 });
  const cb: any = (await req.json())?.Body?.stkCallback;
  if (cb) {
    const items: any[] = cb.CallbackMetadata?.Item ?? [];
    const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value ?? null;
    await admin.from('payments').update({ status: cb.ResultCode === 0 ? 'paid' : 'failed', receipt }).eq('checkout_id', cb.CheckoutRequestID);
  }
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), { headers: { 'Content-Type': 'application/json' } });
});
