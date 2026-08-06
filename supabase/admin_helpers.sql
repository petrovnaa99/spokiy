-- Додай помічників адміна (один раз у Supabase → SQL Editor → Run)
create table if not exists public.admin_helpers (
  email       text primary key,
  added_by    text,
  created_at  timestamptz not null default now()
);

alter table public.admin_helpers enable row level security;
