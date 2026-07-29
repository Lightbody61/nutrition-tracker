-- Consolidated Community Forum v2 migration.
-- Safe whether the original forum migration was applied or the forum is absent.

create table if not exists public.forum_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  screen_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.community_forum_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_comment_id uuid null references public.community_forum_comments(id) on delete cascade,
  reply_to_user_id uuid null references auth.users(id) on delete set null,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.forum_comment_likes (
  comment_id uuid not null references public.community_forum_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.community_forum_comments
  add column if not exists parent_comment_id uuid null,
  add column if not exists reply_to_user_id uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_forum_comments_parent_comment_id_fkey' and conrelid = 'public.community_forum_comments'::regclass) then
    alter table public.community_forum_comments add constraint community_forum_comments_parent_comment_id_fkey foreign key (parent_comment_id) references public.community_forum_comments(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'community_forum_comments_reply_to_user_id_fkey' and conrelid = 'public.community_forum_comments'::regclass) then
    alter table public.community_forum_comments add constraint community_forum_comments_reply_to_user_id_fkey foreign key (reply_to_user_id) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'community_forum_comment_not_blank' and conrelid = 'public.community_forum_comments'::regclass) then
    alter table public.community_forum_comments add constraint community_forum_comment_not_blank check (length(trim(comment_text)) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'community_forum_comment_length' and conrelid = 'public.community_forum_comments'::regclass) then
    alter table public.community_forum_comments add constraint community_forum_comment_length check (length(comment_text) <= 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forum_profiles_screen_name_length' and conrelid = 'public.forum_profiles'::regclass) then
    alter table public.forum_profiles add constraint forum_profiles_screen_name_length check (length(trim(screen_name)) between 3 and 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forum_profiles_screen_name_characters' and conrelid = 'public.forum_profiles'::regclass) then
    alter table public.forum_profiles add constraint forum_profiles_screen_name_characters check (trim(screen_name) ~ '^[A-Za-z0-9 _-]+$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forum_profiles_screen_name_trimmed' and conrelid = 'public.forum_profiles'::regclass) then
    alter table public.forum_profiles add constraint forum_profiles_screen_name_trimmed check (screen_name = trim(screen_name));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forum_profiles_screen_name_not_email' and conrelid = 'public.forum_profiles'::regclass) then
    alter table public.forum_profiles add constraint forum_profiles_screen_name_not_email check (position('@' in screen_name) = 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forum_profiles_screen_name_not_reserved' and conrelid = 'public.forum_profiles'::regclass) then
    alter table public.forum_profiles add constraint forum_profiles_screen_name_not_reserved check (lower(screen_name) not in ('admin','administrator','moderator','nutrition tracker','system'));
  end if;
end
$$;

create unique index if not exists forum_profiles_screen_name_unique on public.forum_profiles (lower(screen_name));
create index if not exists community_forum_comments_created_at_idx on public.community_forum_comments (created_at desc);
create index if not exists community_forum_comments_parent_comment_id_idx on public.community_forum_comments (parent_comment_id);
create index if not exists community_forum_comments_user_id_idx on public.community_forum_comments (user_id);
create index if not exists community_forum_comments_reply_to_user_id_idx on public.community_forum_comments (reply_to_user_id);
create index if not exists forum_comment_likes_user_id_idx on public.forum_comment_likes (user_id);

create or replace function public.set_forum_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists forum_profiles_set_updated_at on public.forum_profiles;
create trigger forum_profiles_set_updated_at before update on public.forum_profiles for each row execute function public.set_forum_profile_updated_at();

create or replace function public.is_forum_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.forum_admins where user_id = auth.uid());
$$;

create or replace function public.validate_forum_reply_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_comment_id is not null and not exists (
    select 1 from public.community_forum_comments
    where id = new.parent_comment_id and parent_comment_id is null
  ) then
    raise exception 'Replies must reference an existing top-level comment' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists community_forum_validate_reply_target on public.community_forum_comments;
create trigger community_forum_validate_reply_target before insert or update of parent_comment_id on public.community_forum_comments for each row execute function public.validate_forum_reply_target();

alter table public.forum_profiles enable row level security;
alter table public.forum_admins enable row level security;
alter table public.community_forum_comments enable row level security;
alter table public.forum_comment_likes enable row level security;

do $$
declare policy_row record;
begin
  for policy_row in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('forum_profiles','forum_admins','community_forum_comments','forum_comment_likes') loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$$;

create policy "Authenticated users can read forum profiles" on public.forum_profiles for select to authenticated using (true);
create policy "Users can create their own forum profile" on public.forum_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own forum profile" on public.forum_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- forum_admins intentionally has no direct browser policies. Membership is exposed only as a boolean through is_forum_admin().

create policy "Authenticated users can read forum comments" on public.community_forum_comments for select to authenticated using (true);
create policy "Profiled users can create their own forum comments" on public.community_forum_comments for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.forum_profiles where user_id = auth.uid())
);
create policy "Authors and forum administrators can delete comments" on public.community_forum_comments for delete to authenticated using (
  auth.uid() = user_id or public.is_forum_admin()
);
create policy "Authenticated users can read forum likes" on public.forum_comment_likes for select to authenticated using (true);
create policy "Users can add their own forum likes" on public.forum_comment_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can remove their own forum likes" on public.forum_comment_likes for delete to authenticated using (auth.uid() = user_id);

revoke all on table public.forum_profiles from anon;
revoke all on table public.forum_admins from anon, authenticated;
revoke all on table public.community_forum_comments from anon;
revoke all on table public.forum_comment_likes from anon;
revoke all on function public.is_forum_admin() from public, anon;
revoke all on function public.set_forum_profile_updated_at() from public, anon, authenticated;
revoke all on function public.validate_forum_reply_target() from public, anon, authenticated;

grant select, insert, update on table public.forum_profiles to authenticated;
grant select, insert, delete on table public.community_forum_comments to authenticated;
grant select, insert, delete on table public.forum_comment_likes to authenticated;
grant execute on function public.is_forum_admin() to authenticated;

-- After this migration succeeds, add Jody manually as an administrator.
-- Replace JODY_AUTH_USER_UUID with the UUID from
-- Supabase Authentication → Users
--
-- insert into public.forum_admins (user_id)
-- values ('JODY_AUTH_USER_UUID')
-- on conflict (user_id) do nothing;
