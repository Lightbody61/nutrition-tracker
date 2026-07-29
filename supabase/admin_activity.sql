-- Run in the Supabase SQL editor before deploying the Admin module.
-- Administrator assignments must be inserted only by a privileged operator.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  session_started_at timestamptz,
  last_page text,
  session_count bigint not null default 0 check (session_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default current_date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

alter table public.admin_users enable row level security;
alter table public.user_activity enable row level security;
alter table public.user_activity_days enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.user_activity from anon, authenticated;
revoke all on table public.user_activity_days from anon, authenticated;

drop policy if exists "Users read their own activity" on public.user_activity;
create policy "Users read their own activity" on public.user_activity for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users insert their own activity" on public.user_activity;
create policy "Users insert their own activity" on public.user_activity for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users update their own activity" on public.user_activity;
create policy "Users update their own activity" on public.user_activity for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users read their own activity days" on public.user_activity_days;
create policy "Users read their own activity days" on public.user_activity_days for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users insert their own activity days" on public.user_activity_days;
create policy "Users insert their own activity days" on public.user_activity_days for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users update their own activity days" on public.user_activity_days;
create policy "Users update their own activity days" on public.user_activity_days for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.record_user_activity(p_page text default null, p_session_started boolean default false)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user_id uuid := auth.uid(); v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  insert into public.user_activity(user_id,last_seen_at,session_started_at,last_page,session_count,updated_at)
  values(v_user_id,v_now,case when p_session_started then v_now else null end,left(nullif(trim(p_page),''),100),case when p_session_started then 1 else 0 end,v_now)
  on conflict(user_id) do update set
    last_seen_at=v_now,
    session_started_at=case when p_session_started then v_now else user_activity.session_started_at end,
    last_page=coalesce(left(nullif(trim(p_page),''),100),user_activity.last_page),
    session_count=user_activity.session_count+case when p_session_started then 1 else 0 end,
    updated_at=v_now;
  insert into public.user_activity_days(user_id,activity_date,first_seen_at,last_seen_at)
  values(v_user_id,(v_now at time zone 'UTC')::date,v_now,v_now)
  on conflict(user_id,activity_date) do update set last_seen_at=v_now;
end; $$;

revoke all on function public.record_user_activity(text,boolean) from public, anon;
grant execute on function public.record_user_activity(text,boolean) to authenticated;

create index if not exists user_activity_last_seen_idx on public.user_activity(last_seen_at desc);
create index if not exists user_activity_days_user_idx on public.user_activity_days(user_id,activity_date desc);

-- Initial administrator example (replace with the real Auth UUID in SQL Editor):
-- insert into public.admin_users(user_id) values ('ACTUAL_ADMIN_AUTH_USER_UUID');
