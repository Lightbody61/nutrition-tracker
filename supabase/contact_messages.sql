-- Run manually in the Supabase SQL editor before deploying Contact Administrator.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  sender_email text not null check (char_length(sender_email) between 3 and 254),
  subject text not null check (char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 1 and 5000),
  delivery_status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists "Users can submit their own contact messages" on public.contact_messages;
create policy "Users can submit their own contact messages"
on public.contact_messages for insert to authenticated
with check (user_id = auth.uid());

revoke all on public.contact_messages from anon;
revoke select, update, delete on public.contact_messages from authenticated;
grant insert on public.contact_messages to authenticated;
