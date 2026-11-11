-- Береке: схема для Supabase. Выполнить один раз в SQL Editor.
-- Все данные магазина хранятся в одной таблице «records»; видны только вошедшему пользователю.

create table if not exists public.records (
  id uuid primary key,
  owner uuid not null default auth.uid(),
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  seq bigint not null default 0
);

-- seq растёт при каждой записи: по нему устройства забирают только новое
create sequence if not exists public.records_seq;

create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('public.records_seq');
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

create index if not exists records_owner_seq on public.records (owner, seq);

-- Защита: каждый видит и меняет только свои записи
alter table public.records enable row level security;

drop policy if exists "own rows" on public.records;
create policy "own rows" on public.records
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- Права для вошедших пользователей (анонимный доступ закрыт)
revoke all on public.records from anon;
grant select, insert, update on public.records to authenticated;
grant usage, select on sequence public.records_seq to authenticated;
