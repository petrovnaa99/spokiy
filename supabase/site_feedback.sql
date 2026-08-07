-- Відгуки та побажання користувачів (один раз у Supabase → SQL Editor → Run)
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
