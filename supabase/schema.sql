-- Tribridge Services: run once in Supabase > SQL Editor.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null default '',
  phone text not null default '',
  email text,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);
create table public.services (
  id text primary key, title text not null, description text,
  free boolean not null default false, price integer, sort int not null default 0
);
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id text not null references public.services(id),
  details text,
  status text not null default 'new' check (status in ('new','in_progress','done','cancelled')),
  created_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null,
  created_at timestamptz not null default now()
);
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, phone, email)
  values (new.id,
    coalesce(lower(new.raw_user_meta_data->>'username'), split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'phone',''),
    new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.username_available(u text) returns boolean
language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.profiles where username = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

create function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.requests enable row level security;
alter table public.announcements enable row level security;
alter table public.feedback enable row level security;

create policy "profile own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "services read" on public.services for select using (true);
create policy "services admin write" on public.services for all using (public.is_admin()) with check (public.is_admin());
create policy "requests read" on public.requests for select using (user_id = auth.uid() or public.is_admin());
create policy "requests insert own" on public.requests for insert with check (user_id = auth.uid());
create policy "requests admin update" on public.requests for update using (public.is_admin());
create policy "news read" on public.announcements for select using (auth.role() = 'authenticated');
create policy "news admin write" on public.announcements for all using (public.is_admin()) with check (public.is_admin());
create policy "feedback insert own" on public.feedback for insert with check (user_id = auth.uid());
create policy "feedback admin read" on public.feedback for select using (public.is_admin());

alter publication supabase_realtime add table public.requests, public.announcements;

insert into public.services (id, title, description, free, price, sort) values
('guidance','Advice and updates','Deadlines, checklists and announcements.',true,null,0),
('kuccps','KUCCPS application help','We sit with you and apply on the KUCCPS portal. You pay the KUCCPS fee to KUCCPS yourself.',false,null,1),
('kra','KRA PIN registration','We register your PIN on iTax. KRA does not charge for it.',false,null,2),
('id','National ID preparation','We check your documents and guide your visit to the registration office. The first ID is free.',false,null,3),
('hef','HEF and HELB application','We complete your funding application after placement.',false,null,4),
('sha','SHA registration','We register or update your SHA details.',false,null,5);

-- After you create your account in the app, make yourself admin (use your username):
-- update public.profiles set role = 'admin' where username = 'yourusername';
