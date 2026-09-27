-- Vexel AI persistent per-user chat history
-- Run this migration in the Supabase SQL Editor for the Vexel project.

create table if not exists public.vexel_chats (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  messages jsonb not null default '[]'::jsonb,
  lock_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vexel_chats_user_updated_idx
  on public.vexel_chats (user_id, updated_at desc);

alter table public.vexel_chats enable row level security;

-- Re-create policies idempotently so the migration can be safely re-run.
drop policy if exists "Users can read their own Vexel chats" on public.vexel_chats;
drop policy if exists "Users can insert their own Vexel chats" on public.vexel_chats;
drop policy if exists "Users can update their own Vexel chats" on public.vexel_chats;
drop policy if exists "Users can delete their own Vexel chats" on public.vexel_chats;

create policy "Users can read their own Vexel chats"
on public.vexel_chats
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own Vexel chats"
on public.vexel_chats
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own Vexel chats"
on public.vexel_chats
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own Vexel chats"
on public.vexel_chats
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_vexel_chat_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vexel_chats_updated_at on public.vexel_chats;

create trigger vexel_chats_updated_at
before update on public.vexel_chats
for each row
execute function public.set_vexel_chat_updated_at();
