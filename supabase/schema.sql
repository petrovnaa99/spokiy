-- Схема для Supabase (Postgres).
-- Виконати один раз: Supabase Dashboard → SQL Editor → New query → вставити → Run.
-- Структура повторює локальну SQLite-таблицю (email, data, updated_at).

create table if not exists public.users (
  email       text primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- Доступ до таблиці лише з сервера через service_role ключ.
-- Вмикаємо RLS і НЕ створюємо публічних політик, тож анонімний/публічний
-- ключ доступу до даних не матиме (service_role обходить RLS).
alter table public.users enable row level security;

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
