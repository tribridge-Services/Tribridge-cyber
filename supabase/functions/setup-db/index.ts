import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.4';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const reply = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json' } });

const NAMES = `'Welcome to Tribridge Cyber, ' || coalesce(nullif(split_part(trim(FULL), ' ', 2), ''), nullif(split_part(trim(FULL), ' ', 1), ''), 'friend') || '! Advice is free. When you want us to apply for you, open Services, choose one and fill the form. Pay first, then we start, and you can follow everything under My requests. Important: we cannot recover your email or password, so remember them or write them down.'`;

const CHUNKS: { name: string; sql: string }[] = [
  { name: '1 Columns', sql: `
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('student','staff','admin'));
alter table public.profiles add column if not exists dob date;
alter table public.profiles add column if not exists county text;
alter table public.profiles add column if not exists kcse_index text;
alter table public.profiles add column if not exists parent_phone text;
alter table public.profiles add column if not exists aware_at timestamptz;
alter table public.profiles add column if not exists consented_at timestamptz;
alter table public.profiles add column if not exists calc_unlocked boolean not null default false;
alter table public.profiles add column if not exists calc_credits integer not null default 0;
alter table public.profiles add column if not exists calc_until timestamptz;
alter table public.services add column if not exists note text;
alter table public.services add column if not exists soon boolean not null default false;
alter table public.services add column if not exists price_live integer;
alter table public.services add column if not exists price_full integer;
alter table public.services add column if not exists fields jsonb not null default '[]'::jsonb;
alter table public.requests add column if not exists mode text;
alter table public.requests add column if not exists form jsonb not null default '{}'::jsonb;
alter table public.requests add column if not exists consent_at timestamptz;
alter table public.messages alter column sender_id drop not null;
alter table public.messages add column if not exists bot boolean not null default false;
alter table public.payments alter column request_id drop not null;
alter table public.payments add column if not exists purpose text not null default 'request';
alter table public.payments add column if not exists method text not null default 'stk';
alter table public.payments add column if not exists note text;
` },
  { name: '2 Tables', sql: `
create table if not exists public.settings (key text primary key, value text not null);
create table if not exists public.programmes (id bigint generated always as identity primary key, programme text not null, institution text not null, req text not null, cutoff numeric not null, year int);
create table if not exists public.mpesa_messages (code text primary key, amount numeric not null, sender text, raw text, created_at timestamptz not null default now());
create table if not exists public.sms_log (id bigint generated always as identity primary key, created_at timestamptz not null default now(), sender text, outcome text);
create table if not exists public.calc_results (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), summary jsonb not null, courses jsonb not null);
alter table public.calc_results add column if not exists expires_at timestamptz not null default (now() + interval '30 minutes');
create table if not exists public.inbox (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, body text not null, created_at timestamptz not null default now(), read boolean not null default false);
create table if not exists public.push_tokens (token text primary key, user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now());
create unique index if not exists payments_code_unique on public.payments (receipt) where method = 'manual' and receipt is not null;
` },
  { name: '3 Security switches', sql: `
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.requests enable row level security;
alter table public.announcements enable row level security;
alter table public.feedback enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;
alter table public.settings enable row level security;
alter table public.programmes enable row level security;
alter table public.mpesa_messages enable row level security;
alter table public.sms_log enable row level security;
alter table public.calc_results enable row level security;
alter table public.inbox enable row level security;
alter table public.push_tokens enable row level security;
` },
  { name: '4 Helper functions', sql: `
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create or replace function public.is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff');
$$;
create or replace function public.username_available(u text) returns boolean
language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;
create or replace function public.set_role(uname text, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if new_role not in ('student','staff') then raise exception 'Role must be student or staff'; end if;
  update public.profiles set role = new_role where username = lower(uname) and role <> 'admin';
  if not found then raise exception 'No such user, or that user is an admin'; end if;
end $$;
grant execute on function public.set_role(text, text) to authenticated;
create or replace function public.save_token(t text) returns void
language sql security definer set search_path = public as $$
  insert into public.push_tokens (token, user_id) values (t, auth.uid())
  on conflict (token) do update set user_id = auth.uid();
$$;
grant execute on function public.save_token(text) to authenticated;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, phone, email, consented_at, aware_at)
  values (new.id,
    coalesce(lower(new.raw_user_meta_data->>'username'), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    new.email,
    case when new.raw_user_meta_data->>'consent' = 'true' then now() end,
    case when new.raw_user_meta_data->>'aware' = 'true' then now() end);
  return new;
end $$;
create or replace trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
` },
  { name: '5 Who can see what', sql: `
drop policy if exists "profile own or admin" on public.profiles;
create policy "profile own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin() or public.is_staff());
drop policy if exists "staff read profiles" on public.profiles;
drop policy if exists "profile update own" on public.profiles;
create policy "profile update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, username, phone, dob, county, kcse_index, parent_phone) on public.profiles to authenticated;
drop policy if exists "services read" on public.services;
create policy "services read" on public.services for select using (true);
drop policy if exists "services admin write" on public.services;
create policy "services admin write" on public.services for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "requests read" on public.requests;
create policy "requests read" on public.requests for select using (user_id = auth.uid() or public.is_admin() or public.is_staff());
drop policy if exists "staff read requests" on public.requests;
drop policy if exists "requests insert own" on public.requests;
create policy "requests insert own" on public.requests for insert with check (user_id = auth.uid());
drop policy if exists "requests admin update" on public.requests;
create policy "requests admin update" on public.requests for update using (public.is_admin() or public.is_staff()) with check (public.is_admin() or public.is_staff());
drop policy if exists "staff update requests" on public.requests;
drop policy if exists "news read" on public.announcements;
create policy "news read" on public.announcements for select using (auth.uid() is not null);
drop policy if exists "news admin write" on public.announcements;
create policy "news admin write" on public.announcements for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "feedback insert own" on public.feedback;
create policy "feedback insert own" on public.feedback for insert with check (user_id = auth.uid());
drop policy if exists "feedback admin read" on public.feedback;
create policy "feedback admin read" on public.feedback for select using (public.is_admin());
drop policy if exists "payments read" on public.payments;
create policy "payments read" on public.payments for select using (user_id = auth.uid() or public.is_admin() or public.is_staff());
drop policy if exists "staff read payments" on public.payments;
drop policy if exists "payments admin update" on public.payments;
create policy "payments admin update" on public.payments for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select using (public.is_admin() or public.is_staff() or exists (select 1 from public.requests r where r.id = request_id and r.user_id = auth.uid()));
drop policy if exists "staff read messages" on public.messages;
drop policy if exists "messages send" on public.messages;
create policy "messages send" on public.messages for insert with check (sender_id = auth.uid() and (public.is_admin() or public.is_staff() or exists (select 1 from public.requests r where r.id = request_id and r.user_id = auth.uid())));
drop policy if exists "staff send messages" on public.messages;
drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select using (auth.uid() is not null);
drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "programmes read unlocked" on public.programmes;
drop policy if exists "programmes read session" on public.programmes;
drop policy if exists "programmes admin write" on public.programmes;
create policy "programmes admin write" on public.programmes for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "mpesa admin read" on public.mpesa_messages;
create policy "mpesa admin read" on public.mpesa_messages for select using (public.is_admin());
drop policy if exists "sms admin read" on public.sms_log;
create policy "sms admin read" on public.sms_log for select using (public.is_admin());
drop policy if exists "calc results own" on public.calc_results;
create policy "calc results own" on public.calc_results for select using (user_id = auth.uid() and expires_at > now());
drop policy if exists "inbox own read" on public.inbox;
create policy "inbox own read" on public.inbox for select using (user_id = auth.uid());
drop policy if exists "inbox own update" on public.inbox;
create policy "inbox own update" on public.inbox for update using (user_id = auth.uid()) with check (user_id = auth.uid());
` },
  { name: '6 File storage', sql: `
insert into storage.buckets (id, name, public) values ('docs', 'docs', false) on conflict (id) do nothing;
drop policy if exists "docs read" on storage.objects;
create policy "docs read" on storage.objects for select to authenticated using (bucket_id = 'docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin() or public.is_staff()));
drop policy if exists "docs upload" on storage.objects;
create policy "docs upload" on storage.objects for insert to authenticated with check (bucket_id = 'docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin() or public.is_staff()));
drop policy if exists "staff read files" on storage.objects;
drop policy if exists "staff upload files" on storage.objects;
` },
  { name: '7 Bot messages', sql: `
create or replace function public.bot_say(rid uuid, txt text) returns void
language sql security definer set search_path = public as $$
  insert into public.messages (request_id, sender_id, body, bot) values (rid, null, txt, true);
$$;
create or replace function public.bot_tell(uid uuid, txt text) returns void
language sql security definer set search_path = public as $$
  insert into public.inbox (user_id, body) values (uid, txt);
$$;
revoke all on function public.bot_say(uuid, text) from public, anon, authenticated;
revoke all on function public.bot_tell(uuid, text) from public, anon, authenticated;
create or replace function public.bot_welcome() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.bot_tell(new.id, ${NAMES.replaceAll('FULL', 'new.full_name')});
  return new;
end $$;
create or replace function public.bot_on_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text; p integer; ins text;
begin
  select s.title, case new.mode when 'live' then s.price_live else s.price_full end into t, p from public.services s where s.id = new.service_id;
  select value into ins from public.settings where key = 'pay_instructions';
  perform public.bot_say(new.id, 'Hello! We received your ' || coalesce(t, 'request') || '. Next: 1) Upload the documents we need under My account, My documents. 2) Pay KES ' || coalesce(p::text, '(fee to be confirmed)') || '. ' || coalesce(ins, '') || ' 3) Type your M-Pesa code on this request. We start as soon as the payment is confirmed.');
  perform public.bot_tell(new.user_id, 'We received your ' || coalesce(t, 'request') || '. Open My requests to see the next steps.');
  return new;
end $$;
create or replace function public.bot_on_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if new.request_id is not null then
      perform public.bot_say(new.request_id, 'Payment of KES ' || new.amount::text || ' received. Thank you! We have started working on your request.');
    end if;
    perform public.bot_tell(new.user_id, 'Your payment of KES ' || new.amount::text || ' is confirmed. Thank you!');
  elsif new.status = 'failed' and old.status is distinct from 'failed' then
    if new.request_id is not null then
      perform public.bot_say(new.request_id, 'We could not confirm your payment code. Please check the code in your M-Pesa message and send it again.');
    end if;
    perform public.bot_tell(new.user_id, 'We could not confirm your payment code. Please check it in your M-Pesa message and send it again.');
  elsif new.status = 'pending' and new.note is distinct from old.note and new.note like 'Amount does not match%' then
    if new.request_id is not null then perform public.bot_say(new.request_id, new.note); end if;
    perform public.bot_tell(new.user_id, new.note);
  end if;
  return new;
end $$;
create or replace function public.bot_on_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    perform public.bot_say(new.id, 'Good news! Your request is complete. Check your phone, your email or the portal for the result.');
    perform public.bot_tell(new.user_id, 'Good news! One of your requests is complete. Open My requests.');
  end if;
  return new;
end $$;
create or replace function public.unlock_calc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.purpose = 'calculator' and new.status = 'paid' and old.status is distinct from 'paid' then
    update public.profiles set calc_credits = calc_credits + 1 where id = new.user_id;
    perform public.bot_tell(new.user_id, 'Your Course analyzer payment is confirmed. Open the Course analyzer to run your one analysis.');
  end if;
  return new;
end $$;
` },
  { name: '8 Payment checker', sql: `
create or replace function public.match_payment(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare pay public.payments%rowtype; sms public.mpesa_messages%rowtype;
begin
  select * into pay from public.payments where receipt = upper(trim(p_code)) and method = 'manual' and status = 'pending' limit 1;
  if not found then return; end if;
  select * into sms from public.mpesa_messages where code = pay.receipt;
  if not found then
    update public.payments set note = 'Waiting for the M-Pesa confirmation message.' where id = pay.id;
    return;
  end if;
  if sms.amount >= pay.amount then
    update public.payments set status = 'paid', note = 'Verified automatically from the M-Pesa message.' where id = pay.id;
    if pay.request_id is not null then
      update public.requests set status = 'in_progress' where id = pay.request_id and status = 'new';
    end if;
  else
    update public.payments set note = 'Amount does not match: M-Pesa shows KES ' || sms.amount::text || ' but the price is KES ' || pay.amount::text || '. An admin will check.' where id = pay.id;
  end if;
end $$;
create or replace function public.ingest_sms(p_code text, p_amount numeric, p_sender text, p_raw text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.mpesa_messages (code, amount, sender, raw) values (upper(trim(p_code)), p_amount, p_sender, p_raw) on conflict (code) do nothing;
  perform public.match_payment(p_code);
end $$;
create or replace function public.log_sms(p_sender text, p_outcome text) returns void
language sql security definer set search_path = public as $$
  insert into public.sms_log (sender, outcome) values (p_sender, p_outcome);
$$;
create or replace function public.consume_credit(uid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set calc_credits = calc_credits - 1 where id = uid and calc_credits > 0;
  return found;
end $$;
create or replace function public.refund_credit(uid uuid) returns void
language sql security definer set search_path = public as $$
  update public.profiles set calc_credits = calc_credits + 1 where id = uid;
$$;
revoke all on function public.match_payment(text) from public, anon, authenticated;
revoke all on function public.ingest_sms(text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.log_sms(text, text) from public, anon, authenticated;
revoke all on function public.consume_credit(uuid) from public, anon, authenticated;
revoke all on function public.refund_credit(uuid) from public, anon, authenticated;
grant execute on function public.ingest_sms(text, numeric, text, text) to service_role;
grant execute on function public.log_sms(text, text) to service_role;
grant execute on function public.consume_credit(uuid) to service_role;
grant execute on function public.refund_credit(uuid) to service_role;
create or replace function public.submit_payment(rid uuid, code text) returns void
language plpgsql security definer set search_path = public as $$
declare amt integer; ph text;
begin
  select case r.mode when 'live' then s.price_live else s.price_full end into amt
  from requests r join services s on s.id = r.service_id
  where r.id = rid and r.user_id = auth.uid();
  if amt is null then raise exception 'No price set for this request'; end if;
  select phone into ph from profiles where id = auth.uid();
  insert into payments (user_id, request_id, amount, phone, status, receipt, purpose, method)
  values (auth.uid(), rid, amt, coalesce(ph, ''), 'pending', upper(trim(code)), 'request', 'manual');
  perform public.match_payment(code);
end $$;
grant execute on function public.submit_payment(uuid, text) to authenticated;
create or replace function public.submit_calc_payment(code text) returns void
language plpgsql security definer set search_path = public as $$
declare amt integer; ph text;
begin
  select price_full into amt from services where id = 'analyzer';
  if amt is null then raise exception 'No price set for the analyzer'; end if;
  select phone into ph from profiles where id = auth.uid();
  insert into payments (user_id, request_id, amount, phone, status, receipt, purpose, method)
  values (auth.uid(), null, amt, coalesce(ph, ''), 'pending', upper(trim(code)), 'calculator', 'manual');
  perform public.match_payment(code);
end $$;
grant execute on function public.submit_calc_payment(text) to authenticated;
create or replace function public.admin_paste_sms(txt text) returns text
language plpgsql security definer set search_path = public as $$
declare c text; a text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  c := (regexp_match(txt, '([A-Za-z0-9]{10})[[:space:]]+Confirmed', 'i'))[1];
  a := (regexp_match(txt, 'Ksh[.]?[[:space:]]?([0-9,]+([.][0-9]+)?)', 'i'))[1];
  if c is null or a is null or txt !~* 'received' then return 'That is not an M-Pesa payment received message.'; end if;
  perform public.ingest_sms(c, replace(a, ',', '')::numeric, 'MPESA', left(txt, 400));
  return 'Recorded code ' || upper(c) || ' for KES ' || a || '. The bot checked it against waiting payments.';
end $$;
grant execute on function public.admin_paste_sms(text) to authenticated;
` },
  { name: '9 Bot check and test', sql: `
create or replace function public.bot_health() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'Payment checker', to_regprocedure('public.match_payment(text)') is not null,
    'SMS receiver', to_regprocedure('public.ingest_sms(text,numeric,text,text)') is not null,
    'Pay button', to_regprocedure('public.submit_payment(uuid,text)') is not null,
    'Welcome for new students', exists (select 1 from pg_trigger where tgname = 'profiles_welcome' and not tgisinternal),
    'Welcome for new requests', exists (select 1 from pg_trigger where tgname = 'requests_bot' and not tgisinternal),
    'Payment messages', exists (select 1 from pg_trigger where tgname = 'payments_bot' and not tgisinternal),
    'Chat accepts bot messages', coalesce((select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'sender_id'), false),
    'Inbox', to_regclass('public.inbox') is not null,
    'M-Pesa messages read so far', (select count(*) from public.mpesa_messages),
    'Phone messages received in the last day', (select count(*) from public.sms_log where created_at > now() - interval '1 day')
  );
end $$;
grant execute on function public.bot_health() to authenticated;
create or replace function public.bot_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  perform public.bot_tell(auth.uid(), 'Test message from the bot. If you can read this in your Messages, the bot and the inbox work.');
end $$;
grant execute on function public.bot_test() to authenticated;
` },
  { name: '10 Triggers', sql: `
create or replace trigger requests_bot after insert on public.requests for each row execute function public.bot_on_request();
create or replace trigger payments_bot after update on public.payments for each row execute function public.bot_on_payment();
create or replace trigger requests_done_bot after update of status on public.requests for each row execute function public.bot_on_status();
create or replace trigger profiles_welcome after insert on public.profiles for each row execute function public.bot_welcome();
create or replace trigger payments_unlock after update of status on public.payments for each row execute function public.unlock_calc();
` },
  { name: '11 Live updates', sql: `
do $$
declare t text;
begin
  foreach t in array array['requests','announcements','messages','payments','inbox'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
` },
  { name: '12 Forms', sql: `
update public.services set fields = '[["_h1","About you","h"],["surname","Surname","text"],["first_name","First name","text"],["other_names","Other names (optional)","text"],["id_no","National ID number","text"],["dob","Date of birth, as on your ID","date"],["gender","Gender","select",["Male","Female"]],["_h2","Contact","h"],["phone","Phone number (a code is sent to it)","tel"],["email","Email address (your PIN certificate is sent here)","email"],["_h3","Address and work","h"],["county","County","county"],["town","Town or estate","text"],["postal","Postal address, for example P.O. Box 123, 00100 (optional)","text"],["profession","Profession","select",["Student","Self-employed","Employed","Unemployed","Other"]],["_i1","KRA may send a one-time code to your phone or email while we register you. We will message you on this request when we need it.","info"]]'::jsonb where id = 'kra';
update public.services set fields = '[["_h1","About you","h"],["surname","Surname","text"],["first_name","First name","text"],["other_names","Other names (optional)","text"],["id_no","National ID number (or birth certificate number if you are under 18)","text"],["dob","Date of birth","date"],["gender","Gender","select",["Male","Female"]],["phone","Phone number registered in your name","tel"],["email","Email address (optional)","email"],["_h2","Where you live","h"],["county","County","county"],["sub_county","Sub-county","text"],["ward","Ward","text"],["village","Village or estate","text"],["_h3","Parent or guardian","h"],["guardian_name","Parent or guardian full name","text"],["guardian_id","Parent or guardian ID number","text"],["guardian_phone","Parent or guardian phone","tel"],["_i1","SHA may ask for more details when we register you. We will message you on this request.","info"]]'::jsonb where id = 'sha';
update public.services set fields = '[["_h1","About you","h"],["surname","Surname","text"],["first_name","First name","text"],["other_names","Other names (optional)","text"],["gender","Gender","select",["Male","Female"]],["phone","Phone number","tel"],["email","Email address","email"],["county","County you live in","county"],["_h2","Your exams","h"],["kcse_index","KCSE index number","text"],["kcse_year","KCSE year","text"],["kcpe_index","KCPE index number (the portal uses it as your password)","text"],["birth_no","Birth certificate number","text"],["mean_grade","KCSE mean grade","text"],["grades","Your subject grades, for example Maths B, English C+ (optional)","textarea"],["_h3","Your choices","h"],["choices","Courses and universities you want, in order of preference, up to 6. The Course analyzer can fill this in.","textarea"],["_i1","Upload your KCSE result slip under My account, My documents. You pay the KUCCPS fee to KUCCPS yourself.","info"]]'::jsonb where id = 'kuccps';
update public.services set fields = '[["_h1","About you","h"],["surname","Surname","text"],["first_name","First name","text"],["other_names","Other names (optional)","text"],["phone","Phone number","tel"],["email","Email address","email"],["_h2","Your KUCCPS portal details","h"],["kcse_index","KCSE index number","text"],["kcse_year","KCSE year","text"],["kcpe_index","KCPE index number","text"],["birth_no","Birth certificate number","text"],["_h3","Your new choices","h"],["choices","New courses and universities, in order of preference, up to 6","textarea"],["reason","Why you want to change (optional)","text"]]'::jsonb where id = 'revision';
update public.services set fields = '[["_h1","About you","h"],["surname","Surname","text"],["first_name","First name","text"],["other_names","Other names (optional)","text"],["id_no","National ID number (or KCSE index number if you do not have an ID yet)","text"],["dob","Date of birth","date"],["gender","Gender","select",["Male","Female"]],["phone","Phone number registered in YOUR name","tel"],["email","Email address","email"],["_h2","Your exams","h"],["kcse_index","KCSE index number","text"],["kcse_year","KCSE year","text"],["kcpe_index","KCPE index number","text"],["kcpe_year","KCPE year","text"],["_h3","Your institution","h"],["institution","University or college","text"],["course","Course","text"],["adm_no","Admission number (optional)","text"],["_h4","Your parents or guardians","h"],["father_name","Father full name (write deceased if he has died)","text"],["father_id","Father ID number (optional if deceased)","text"],["father_phone","Father phone (optional if deceased)","tel"],["mother_name","Mother full name (write deceased if she has died)","text"],["mother_id","Mother ID number (optional if deceased)","text"],["mother_phone","Mother phone (optional if deceased)","tel"],["_h5","Two guarantors (they may be your parents)","h"],["g1_name","Guarantor 1 full name","text"],["g1_id","Guarantor 1 ID number","text"],["g1_phone","Guarantor 1 phone","tel"],["g2_name","Guarantor 2 full name","text"],["g2_id","Guarantor 2 ID number","text"],["g2_phone","Guarantor 2 phone","tel"],["_h6","Where your money is paid","h"],["payout_type","Payment method","select",["M-Pesa","Bank"]],["payout","M-Pesa number, or bank name and account number (must be in your name)","text"],["sponsor","Did a school or sponsor support you? Give details (optional)","textarea"],["_i1","Upload under My account, My documents: ID or Maisha Card (both sides), passport photo, admission letter, birth certificate if you are under 18, and a death certificate if a parent has died.","info"]]'::jsonb where id = 'hef';
insert into public.services (id, title, description, free, soon, sort, price_full, fields) values ('analyzer', 'Course analyzer and cluster points', 'Get your cluster points and a list of courses and universities you qualify for.', false, false, 10, 100, '[]'::jsonb) on conflict (id) do update set soon = false;
` },
  { name: '13 Welcome for everyone', sql: `
insert into public.inbox (user_id, body)
select p.id, ${NAMES.replaceAll('FULL', 'p.full_name')} from public.profiles p
where not exists (select 1 from public.inbox i where i.user_id = p.id);
` },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { data: { user } } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
    if (!user) return reply({ ok: false, error: 'Please log in again.' });
    const { data: me }: any = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return reply({ ok: false, error: 'Admins only.' });
    const sql = postgres(env('SUPABASE_DB_URL'), { max: 1, prepare: false, idle_timeout: 5 });
    const steps: { name: string; ok: boolean; error?: string }[] = [];
    for (const c of CHUNKS) {
      try {
        await sql.unsafe(c.sql);
        steps.push({ name: c.name, ok: true });
      } catch (e) {
        steps.push({ name: c.name, ok: false, error: String((e as Error)?.message ?? e) });
      }
    }
    await sql.end();
    return reply({ ok: true, steps });
  } catch (e) {
    return reply({ ok: false, error: String((e as Error)?.message ?? e) });
  }
});
