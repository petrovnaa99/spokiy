-- Схема для Supabase (Postgres).
-- Виконати один раз: Supabase Dashboard -> SQL Editor -> New query -> вставити -> Run.
--
-- MVP-архітектура:
-- 1) public.users зберігає профіль і повний JSON snapshot стану (сумісність із фронтендом).
-- 2) public.diary_entries, public.evidence_records, public.support_resources зберігають
--    ключові дані в нормальних таблицях для аналітики, синхронізації й майбутніх запитів.
--
-- Символ внутрішнього відновлення (recovery*):
-- Поля живуть УСЕРЕДИНІ users.profile / users.data.profile (jsonb), а не в окремих колонках:
--   recoverySymbolId, recoverySymbolName, recoveryStage, recoveryProgress,
--   recoveryLastActivityAt, recoverySymbolSelectedAt.
-- Денний реєстр нарахувань прогресу — у snapshot users.data (не в profile):
--   data.recoveryAwards = { "YYYY-MM-DD": { wellbeing, diary, breath, good, past, exercise } }
--   значення дії = ISO-час нарахування (truthy = уже нараховано сьогодні).
-- Пропуски днів НЕ зменшують progress; символ не «помирає».
-- Це адитивне розширення JSON: існуючі рядки й ключі не видаляються.
-- НЕ виконувати DROP TABLE / TRUNCATE / REPLACE цілого profile під час впровадження.

create table if not exists public.users (
  email       text primary key,
  profile     jsonb       not null default '{}'::jsonb,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.users add column if not exists profile jsonb not null default '{}'::jsonb;
alter table public.users alter column data set default '{}'::jsonb;

create table if not exists public.diary_entries (
  id              text primary key,
  user_email      text not null references public.users(email) on delete cascade,
  type            text not null default 'diary',
  fear            text,
  thought         text,
  situation       text,
  category        text,
  cause           text,
  trigger         text,
  anxiety         integer check (anxiety is null or (anxiety between 1 and 10)),
  mood            integer check (mood is null or (mood between 1 and 5)),
  energy          integer check (energy is null or (energy between 1 and 5)),
  support_methods jsonb,
  review          jsonb,
  payload         jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_diary_entries_user_created
  on public.diary_entries(user_email, created_at desc);
create index if not exists idx_diary_entries_category
  on public.diary_entries(user_email, category);
create index if not exists idx_diary_entries_cause
  on public.diary_entries(user_email, cause);
create index if not exists idx_diary_entries_trigger
  on public.diary_entries(user_email, trigger);

create table if not exists public.evidence_records (
  id          text primary key,
  user_email  text not null references public.users(email) on delete cascade,
  fear        text,
  real_result text,
  conclusion  text,
  payload     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_evidence_records_user_created
  on public.evidence_records(user_email, created_at desc);

create table if not exists public.support_resources (
  user_email text not null references public.users(email) on delete cascade,
  name       text not null,
  uses       integer not null default 0,
  sum_effect numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_email, name)
);

-- Доступ до таблиці лише з сервера через service_role ключ.
-- Вмикаємо RLS і НЕ створюємо публічних політик, тож анонімний/публічний
-- ключ доступу до даних не матиме (service_role обходить RLS).
alter table public.users enable row level security;
alter table public.diary_entries enable row level security;
alter table public.evidence_records enable row level security;
alter table public.support_resources enable row level security;

-- Авторизація (доступ лише через service_role на сервері)
create table if not exists public.auth_credentials (
  email          text primary key,
  password_hash  text not null,
  salt           text not null,
  name           text,
  gender         text check (gender is null or gender in ('female', 'male')),
  created_at     timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  token       text primary key,
  email       text not null references public.auth_credentials(email) on delete cascade,
  expires_at  timestamptz not null
);

create index if not exists idx_auth_sessions_email on public.auth_sessions(email);

create table if not exists public.auth_codes (
  email       text not null references public.auth_credentials(email) on delete cascade,
  purpose     text not null check (purpose in ('login', 'reset')),
  code        text not null,
  expires_at  timestamptz not null,
  primary key (email, purpose)
);

alter table public.auth_credentials enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.auth_codes enable row level security;

-- Telegram-бот: прив'язка акаунта та нагадування
create table if not exists public.telegram_users (
  email        text primary key references public.auth_credentials(email) on delete cascade,
  telegram_id  bigint unique not null,
  settings     jsonb       not null default '{}'::jsonb,
  bot_state    jsonb       not null default '{}'::jsonb,
  linked_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_telegram_users_telegram_id on public.telegram_users(telegram_id);

create table if not exists public.telegram_link_tokens (
  token       text primary key,
  email       text not null references public.auth_credentials(email) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists idx_telegram_link_tokens_email on public.telegram_link_tokens(email);

alter table public.telegram_users enable row level security;
alter table public.telegram_link_tokens enable row level security;

drop trigger if exists trg_telegram_users_touch on public.telegram_users;
create trigger trg_telegram_users_touch
  before insert or update on public.telegram_users
  for each row execute function public.touch_updated_at();

-- Автооновлення updated_at, якщо клієнт його не передав.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  if new.updated_at is null then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_users_touch on public.users;
create trigger trg_users_touch
  before insert or update on public.users
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_diary_entries_touch on public.diary_entries;
create trigger trg_diary_entries_touch
  before insert or update on public.diary_entries
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_support_resources_touch on public.support_resources;
create trigger trg_support_resources_touch
  before insert or update on public.support_resources
  for each row execute function public.touch_updated_at();
