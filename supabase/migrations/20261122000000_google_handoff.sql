-- Punt Tracker: inloggen met Google vanuit de app op het beginscherm.
--
-- Op iPhone opent inloggen met Google vaak in Safari in plaats van in de app. Safari levert
-- de login dan via deze tabel af bij de app: de app maakt een geheime code van 64 tekens,
-- Safari zet daar na het inloggen een refresh-token onder, en de app haalt dat één keer op.
-- De tabel zelf is voor niemand leesbaar; alleen de twee functies hieronder kunnen erbij.

create table if not exists public.handoffs (
  id text primary key,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  constraint handoffs_id_length check (char_length(id) = 64)
);
alter table public.handoffs enable row level security;
revoke all on public.handoffs from anon, authenticated;

-- Safari (ingelogd) zet de login klaar onder de code.
create or replace function public.handoff_put(handoff text, token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if char_length(handoff) <> 64 or char_length(token) > 500 then
    raise exception 'invalid handoff';
  end if;
  delete from public.handoffs where created_at < now() - interval '10 minutes';
  insert into public.handoffs (id, refresh_token) values (handoff, token) on conflict (id) do nothing;
end $$;

-- De app haalt de login op, één keer, binnen tien minuten.
create or replace function public.handoff_take(handoff text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  token text;
begin
  delete from public.handoffs
    where id = handoff and created_at > now() - interval '10 minutes'
    returning refresh_token into token;
  return token;
end $$;

revoke execute on function public.handoff_put(text, text) from public, anon;
grant execute on function public.handoff_put(text, text) to authenticated;
revoke execute on function public.handoff_take(text) from public;
grant execute on function public.handoff_take(text) to anon, authenticated;
