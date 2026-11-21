-- Punt Tracker: accounts en synchronisatie.
--
-- Elke gebruiker ziet en wijzigt alleen zijn eigen rijen (Row Level Security).
-- De app is local-first: dit is de gedeelde kopie waarmee toestellen elkaar bijwerken.
-- Uitvoeren in Supabase: SQL Editor -> deze hele file plakken -> Run.

-- Eén rij per entry van het log. Een verwijderde entry blijft als "grafsteen" bestaan
-- (deleted = true), zodat andere toestellen weten dat ze hem ook moeten weghalen.
create table if not exists public.entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  body jsonb,
  updated bigint not null default 0,      -- wijzigingstijd volgens het toestel (ms)
  deleted boolean not null default false,
  synced_at bigint not null default 0,    -- door de server gezet (ms); toestellen halen op vanaf hier
  primary key (user_id, id),
  constraint entries_id_length check (char_length(id) between 1 and 100),
  constraint entries_body_size check (body is null or pg_column_size(body) < 8192)
);
create index if not exists entries_user_synced on public.entries (user_id, synced_at);

-- Instellingen (tafelregels en het bericht aan jezelf).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated bigint not null default 0,
  constraint profiles_settings_size check (pg_column_size(settings) < 8192)
);

-- Laatste wijziging wint: een oudere versie overschrijft nooit een nieuwere.
-- De server zet synced_at, zodat toestellen weten wat er sinds hun vorige keer bij kwam.
create or replace function public.punt_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated < old.updated then
    return null; -- oudere versie: deze rij niet wijzigen
  end if;
  if tg_table_name = 'entries' then
    new.synced_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  end if;
  return new;
end $$;

drop trigger if exists entries_before_write on public.entries;
create trigger entries_before_write before insert or update on public.entries
  for each row execute function public.punt_before_write();
drop trigger if exists profiles_before_write on public.profiles;
create trigger profiles_before_write before insert or update on public.profiles
  for each row execute function public.punt_before_write();

alter table public.entries enable row level security;
alter table public.profiles enable row level security;

revoke all on public.entries, public.profiles from anon;
grant select, insert, update on public.entries, public.profiles to authenticated;

drop policy if exists "Own entries: read" on public.entries;
drop policy if exists "Own entries: add" on public.entries;
drop policy if exists "Own entries: change" on public.entries;
create policy "Own entries: read" on public.entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own entries: add" on public.entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own entries: change" on public.entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Own profile: read" on public.profiles;
drop policy if exists "Own profile: add" on public.profiles;
drop policy if exists "Own profile: change" on public.profiles;
create policy "Own profile: read" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Own profile: add" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Own profile: change" on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Je eigen account verwijderen, met al je data (via on delete cascade).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
