-- Run once through the Supabase SQL editor. Only server-side service-role calls
-- may access this document. Lobby capability secrets never reach public tables.
-- A revision CAS is one atomic Postgres transaction: bids/awards/budgets/career
-- counters and match results cannot split or apply twice during concurrent writes.
create table if not exists public.draft_state (
  id text primary key check (id = 'main'),
  revision bigint not null default 0,
  value jsonb not null default '{"leagues":{},"lobbies":{}}'::jsonb
);
alter table public.draft_state enable row level security;
revoke all on public.draft_state from anon, authenticated;
insert into public.draft_state(id) values('main') on conflict(id) do nothing;

create or replace function public.draft_read_state()
returns jsonb language sql stable security definer set search_path=public
as $$ select jsonb_build_object('revision', revision, 'state', value) from public.draft_state where id='main' $$;

create or replace function public.draft_commit_state(expected_revision bigint, next_state jsonb)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
  if jsonb_typeof(next_state) <> 'object'
    or jsonb_typeof(next_state->'leagues') <> 'object'
    or jsonb_typeof(next_state->'lobbies') <> 'object' then
    raise exception 'Invalid multiplayer state';
  end if;
  update public.draft_state set value=next_state, revision=revision+1
  where id='main' and revision=expected_revision;
  return found;
end;
$$;

revoke all on function public.draft_read_state() from public, anon, authenticated;
revoke all on function public.draft_commit_state(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.draft_read_state() to service_role;
grant execute on function public.draft_commit_state(bigint,jsonb) to service_role;
