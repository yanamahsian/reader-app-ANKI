-- Persistent Atlas Concept Graph v1.
-- Deterministic, server-side graph derived only from durable Atlas memory + verified catalog metadata.
-- No AI inference and no free-text entity guessing in this layer.

create table if not exists public.atlas_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_type text not null check (concept_type in ('theme', 'genre', 'movement', 'author')),
  concept_key text not null,
  label text not null,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  work_count integer not null default 0 check (work_count >= 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_concepts_user_type_key unique (user_id, concept_type, concept_key)
);

create table if not exists public.atlas_concept_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.atlas_concepts(id) on delete cascade,
  work_id text not null references public.works(id) on delete cascade,
  signal_count integer not null default 0 check (signal_count >= 0),
  signal_types text[] not null default '{}'::text[],
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_concept_evidence_user_concept_work unique (user_id, concept_id, work_id)
);

create table if not exists public.atlas_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  left_concept_id uuid not null references public.atlas_concepts(id) on delete cascade,
  right_concept_id uuid not null references public.atlas_concepts(id) on delete cascade,
  relationship_type text not null default 'co_occurs_in_reading'
    check (relationship_type in ('co_occurs_in_reading')),
  shared_work_count integer not null default 0 check (shared_work_count >= 0),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_relationships_distinct check (left_concept_id <> right_concept_id),
  constraint atlas_relationships_user_pair unique (user_id, left_concept_id, right_concept_id, relationship_type)
);

create table if not exists public.atlas_graph_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dirty boolean not null default true,
  source_signal_count integer not null default 0 check (source_signal_count >= 0),
  active_work_count integer not null default 0 check (active_work_count >= 0),
  concept_count integer not null default 0 check (concept_count >= 0),
  relationship_count integer not null default 0 check (relationship_count >= 0),
  last_refreshed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.atlas_concepts enable row level security;
alter table public.atlas_concept_evidence enable row level security;
alter table public.atlas_relationships enable row level security;
alter table public.atlas_graph_state enable row level security;

revoke all privileges on table public.atlas_concepts from anon, authenticated;
revoke all privileges on table public.atlas_concept_evidence from anon, authenticated;
revoke all privileges on table public.atlas_relationships from anon, authenticated;
revoke all privileges on table public.atlas_graph_state from anon, authenticated;

grant select on table public.atlas_concepts to authenticated;
grant select on table public.atlas_concept_evidence to authenticated;
grant select on table public.atlas_relationships to authenticated;
grant select on table public.atlas_graph_state to authenticated;

create policy atlas_concepts_select_own
  on public.atlas_concepts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy atlas_concept_evidence_select_own
  on public.atlas_concept_evidence for select to authenticated
  using ((select auth.uid()) = user_id);

create policy atlas_relationships_select_own
  on public.atlas_relationships for select to authenticated
  using ((select auth.uid()) = user_id);

create policy atlas_graph_state_select_own
  on public.atlas_graph_state for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists atlas_concepts_user_rank_idx
  on public.atlas_concepts (user_id, work_count desc, evidence_count desc, last_seen_at desc);

create index if not exists atlas_concept_evidence_user_work_idx
  on public.atlas_concept_evidence (user_id, work_id, last_seen_at desc);

create index if not exists atlas_relationships_user_rank_idx
  on public.atlas_relationships (user_id, shared_work_count desc, evidence_count desc, last_seen_at desc);

create or replace function public.atlas_graph_mark_dirty()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  insert into public.atlas_graph_state (user_id, dirty, updated_at)
  values (v_user_id, true, now())
  on conflict (user_id) do update
  set dirty = true,
      updated_at = now();

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    insert into public.atlas_graph_state (user_id, dirty, updated_at)
    values (old.user_id, true, now())
    on conflict (user_id) do update
    set dirty = true,
        updated_at = now();
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.atlas_graph_mark_dirty() from public, anon, authenticated;

drop trigger if exists atlas_graph_memory_dirty_trg on public.atlas_memory_signals;
create trigger atlas_graph_memory_dirty_trg
after insert or update or delete on public.atlas_memory_signals
for each row execute function public.atlas_graph_mark_dirty();

create or replace function public.atlas_refresh_graph_for_user(p_user_id uuid)
returns table (
  source_signal_count integer,
  active_work_count integer,
  concept_count integer,
  relationship_count integer,
  refreshed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_signal_count integer := 0;
  v_active_work_count integer := 0;
  v_concept_count integer := 0;
  v_relationship_count integer := 0;
  v_refreshed_at timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'Atlas graph requires a user id';
  end if;

  select count(*)::integer
    into v_source_signal_count
  from public.atlas_memory_signals s
  where s.user_id = p_user_id;

  create temporary table _atlas_active_works on commit drop as
  select
    s.work_id,
    count(*)::integer as signal_count,
    array_agg(distinct s.signal_type order by s.signal_type) as signal_types,
    min(s.first_seen_at) as first_seen_at,
    max(s.occurred_at) as last_seen_at
  from public.atlas_memory_signals s
  where s.user_id = p_user_id
    and s.work_id is not null
    and (
      s.signal_type in ('progress', 'bookmark', 'highlight', 'note', 'thread_evidence')
      or (
        s.signal_type = 'library'
        and coalesce(s.payload ->> 'status', '') in ('reading', 'finished')
      )
    )
  group by s.work_id;

  select count(*)::integer into v_active_work_count from _atlas_active_works;

  create temporary table _atlas_work_concepts on commit drop as
  select aw.work_id, 'theme'::text as concept_type, theme_id as concept_key,
         initcap(replace(theme_id, '-', ' ')) as label,
         aw.signal_count, aw.signal_types, aw.first_seen_at, aw.last_seen_at
  from _atlas_active_works aw
  join public.works w on w.id = aw.work_id
  cross join lateral unnest(coalesce(w.theme_ids, '{}'::text[])) as theme_id
  where nullif(btrim(theme_id), '') is not null

  union all

  select aw.work_id, 'genre'::text, genre_id,
         initcap(replace(genre_id, '-', ' ')),
         aw.signal_count, aw.signal_types, aw.first_seen_at, aw.last_seen_at
  from _atlas_active_works aw
  join public.works w on w.id = aw.work_id
  cross join lateral unnest(coalesce(w.genre_ids, '{}'::text[])) as genre_id
  where nullif(btrim(genre_id), '') is not null

  union all

  select aw.work_id, 'movement'::text, w.movement_id,
         initcap(replace(w.movement_id, '-', ' ')),
         aw.signal_count, aw.signal_types, aw.first_seen_at, aw.last_seen_at
  from _atlas_active_works aw
  join public.works w on w.id = aw.work_id
  where nullif(btrim(coalesce(w.movement_id, '')), '') is not null

  union all

  select aw.work_id, 'author'::text, w.author_id,
         coalesce(nullif(btrim(a.name), ''), w.author_id),
         aw.signal_count, aw.signal_types, aw.first_seen_at, aw.last_seen_at
  from _atlas_active_works aw
  join public.works w on w.id = aw.work_id
  left join public.authors a on a.id = w.author_id
  where nullif(btrim(coalesce(w.author_id, '')), '') is not null;

  delete from public.atlas_concepts where user_id = p_user_id;

  insert into public.atlas_concepts (
    user_id, concept_type, concept_key, label,
    evidence_count, work_count, first_seen_at, last_seen_at,
    created_at, updated_at
  )
  select
    p_user_id,
    wc.concept_type,
    wc.concept_key,
    max(wc.label),
    sum(wc.signal_count)::integer,
    count(distinct wc.work_id)::integer,
    min(wc.first_seen_at),
    max(wc.last_seen_at),
    v_refreshed_at,
    v_refreshed_at
  from _atlas_work_concepts wc
  group by wc.concept_type, wc.concept_key;

  insert into public.atlas_concept_evidence (
    user_id, concept_id, work_id, signal_count, signal_types,
    first_seen_at, last_seen_at, created_at, updated_at
  )
  select
    p_user_id,
    c.id,
    wc.work_id,
    max(wc.signal_count)::integer,
    array_agg(distinct st order by st),
    min(wc.first_seen_at),
    max(wc.last_seen_at),
    v_refreshed_at,
    v_refreshed_at
  from _atlas_work_concepts wc
  join public.atlas_concepts c
    on c.user_id = p_user_id
   and c.concept_type = wc.concept_type
   and c.concept_key = wc.concept_key
  cross join lateral unnest(wc.signal_types) as st
  group by c.id, wc.work_id;

  insert into public.atlas_relationships (
    user_id, left_concept_id, right_concept_id, relationship_type,
    shared_work_count, evidence_count, first_seen_at, last_seen_at,
    created_at, updated_at
  )
  select
    p_user_id,
    c1.id,
    c2.id,
    'co_occurs_in_reading',
    count(distinct wc1.work_id)::integer,
    sum(wc1.signal_count)::integer,
    min(wc1.first_seen_at),
    max(wc1.last_seen_at),
    v_refreshed_at,
    v_refreshed_at
  from _atlas_work_concepts wc1
  join _atlas_work_concepts wc2
    on wc2.work_id = wc1.work_id
   and (wc1.concept_type, wc1.concept_key) < (wc2.concept_type, wc2.concept_key)
  join public.atlas_concepts c1
    on c1.user_id = p_user_id
   and c1.concept_type = wc1.concept_type
   and c1.concept_key = wc1.concept_key
  join public.atlas_concepts c2
    on c2.user_id = p_user_id
   and c2.concept_type = wc2.concept_type
   and c2.concept_key = wc2.concept_key
  group by c1.id, c2.id;

  select count(*)::integer into v_concept_count
  from public.atlas_concepts where user_id = p_user_id;

  select count(*)::integer into v_relationship_count
  from public.atlas_relationships where user_id = p_user_id;

  insert into public.atlas_graph_state (
    user_id, dirty, source_signal_count, active_work_count,
    concept_count, relationship_count, last_refreshed_at, updated_at
  )
  values (
    p_user_id, false, v_source_signal_count, v_active_work_count,
    v_concept_count, v_relationship_count, v_refreshed_at, v_refreshed_at
  )
  on conflict (user_id) do update
  set dirty = false,
      source_signal_count = excluded.source_signal_count,
      active_work_count = excluded.active_work_count,
      concept_count = excluded.concept_count,
      relationship_count = excluded.relationship_count,
      last_refreshed_at = excluded.last_refreshed_at,
      updated_at = excluded.updated_at;

  return query select
    v_source_signal_count,
    v_active_work_count,
    v_concept_count,
    v_relationship_count,
    v_refreshed_at;
end;
$$;

revoke all on function public.atlas_refresh_graph_for_user(uuid) from public, anon, authenticated;

create or replace function public.refresh_my_atlas_graph()
returns table (
  source_signal_count integer,
  active_work_count integer,
  concept_count integer,
  relationship_count integer,
  refreshed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_dirty boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select s.dirty into v_dirty
  from public.atlas_graph_state s
  where s.user_id = v_user_id;

  if coalesce(v_dirty, true) then
    return query select * from public.atlas_refresh_graph_for_user(v_user_id);
    return;
  end if;

  return query
  select
    s.source_signal_count,
    s.active_work_count,
    s.concept_count,
    s.relationship_count,
    s.last_refreshed_at
  from public.atlas_graph_state s
  where s.user_id = v_user_id;
end;
$$;

revoke all on function public.refresh_my_atlas_graph() from public, anon;
grant execute on function public.refresh_my_atlas_graph() to authenticated;

insert into public.atlas_graph_state (user_id, dirty, updated_at)
select distinct s.user_id, true, now()
from public.atlas_memory_signals s
on conflict (user_id) do update
set dirty = true,
    updated_at = now();