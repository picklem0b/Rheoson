-- Rheoson — accounts table (Supabase Postgres)
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- The API server connects with the secret key, which BYPASSES RLS — the
-- policies below exist so the publishable key stays useless for reading
-- other people's accounts if it ever lands in a browser bundle.

create table if not exists public.users (
    id         text primary key,                -- Clerk user id (sub claim)
    email      text not null default '',
    username   text not null default '',
    image_url  text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- The API upserts on conflict (id) — see services/user_store.py
create index if not exists users_username_idx on public.users (username);

-- ── Row Level Security ─────────────────────────────────────────
alter table public.users enable row level security;

-- Signed-in Supabase-auth users may read/update only their own row. Rheoson
-- authenticates with Clerk, so these policies are effectively no-ops for
-- the app itself — they exist to make the publishable key safe by default.
drop policy if exists "users select own" on public.users;
create policy "users select own"
    on public.users for select
    using (auth.uid()::text = id);

drop policy if exists "users update own" on public.users;
create policy "users update own"
    on public.users for update
    using (auth.uid()::text = id);
