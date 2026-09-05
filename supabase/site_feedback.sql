-- Відгуки та побажання користувачів
-- Запусти один раз у Supabase → SQL Editor → New query → Run
-- Пряме посилання: https://supabase.com/dashboard/project/vickrdzztxwrrngaqcrn/sql/new

create table if not exists public.site_feedback (
  id          bigserial primary key,
  email       text not null,
  name        text,
  kind        text not null default 'feedback',
  message     text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists site_feedback_created_at_idx
  on public.site_feedback (created_at desc);

create index if not exists site_feedback_email_idx
  on public.site_feedback (email);

alter table public.site_feedback enable row level security;

-- service_role (сервер Спокою) обходить RLS; anon/authenticated без політики не мають доступу до чужих рядків.
grant all on table public.site_feedback to service_role;
grant usage, select on sequence public.site_feedback_id_seq to service_role;
