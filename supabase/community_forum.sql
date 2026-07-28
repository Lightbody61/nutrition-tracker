create table if not exists public.community_forum_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  comment_text text not null,
  created_at timestamptz not null default now(),

  constraint community_forum_comment_not_blank
    check (length(trim(comment_text)) > 0),

  constraint community_forum_comment_length
    check (length(comment_text) <= 2000),

  constraint community_forum_author_name_length
    check (author_name is null or length(author_name) <= 100)
);

create index if not exists community_forum_comments_created_at_idx
on public.community_forum_comments (created_at desc);

alter table public.community_forum_comments enable row level security;

revoke all on table public.community_forum_comments from anon;
revoke update, delete on table public.community_forum_comments from authenticated;
grant select, insert on table public.community_forum_comments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_forum_comments'
      and policyname = 'Authenticated users can read forum comments'
  ) then
    create policy "Authenticated users can read forum comments"
    on public.community_forum_comments
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_forum_comments'
      and policyname = 'Authenticated users can create their own forum comments'
  ) then
    create policy "Authenticated users can create their own forum comments"
    on public.community_forum_comments
    for insert
    to authenticated
    with check (auth.uid() = user_id);
  end if;
end
$$;
