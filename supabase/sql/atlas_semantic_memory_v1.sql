create table if not exists public.atlas_semantic_sources (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('annotation', 'thread')),
  source_id uuid not null,
  source_revision_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, source_type, source_id)
);

create table if not exists public.atlas_semantic_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('concept', 'person')),
  canonical_key text not null check (canonical_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  label_en text not null,
  label_ru text not null,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  work_count integer not null default 0 check (work_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entity_type, canonical_key)
);

create table if not exists public.atlas_semantic_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.atlas_semantic_concepts(id) on delete cascade,
  source_type text not null check (source_type in ('annotation', 'thread')),
  source_id uuid not null,
  work_id text references public.works(id) on delete set null,
  excerpt text,
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  source_revision_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, concept_id, source_type, source_id)
);

create table if not exists public.atlas_semantic_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  left_concept_id uuid not null references public.atlas_semantic_concepts(id) on delete cascade,
  right_concept_id uuid not null references public.atlas_semantic_concepts(id) on delete cascade,
  relationship_type text not null default 'co_occurs_in_memory' check (relationship_type = 'co_occurs_in_memory'),
  shared_source_count integer not null default 0 check (shared_source_count >= 0),
  shared_work_count integer not null default 0 check (shared_work_count >= 0),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_concept_id <> right_concept_id),
  unique (user_id, left_concept_id, right_concept_id, relationship_type)
);

alter table public.atlas_semantic_sources enable row level security;
alter table public.atlas_semantic_concepts enable row level security;
alter table public.atlas_semantic_evidence enable row level security;
alter table public.atlas_semantic_relationships enable row level security;

revoke all on public.atlas_semantic_sources from anon, authenticated;
revoke all on public.atlas_semantic_concepts from anon, authenticated;
revoke all on public.atlas_semantic_evidence from anon, authenticated;
revoke all on public.atlas_semantic_relationships from anon, authenticated;

grant select on public.atlas_semantic_concepts to authenticated;
grant select on public.atlas_semantic_evidence to authenticated;
grant select on public.atlas_semantic_relationships to authenticated;

grant all on public.atlas_semantic_sources to service_role;
grant all on public.atlas_semantic_concepts to service_role;
grant all on public.atlas_semantic_evidence to service_role;
grant all on public.atlas_semantic_relationships to service_role;

create policy atlas_semantic_concepts_select_own on public.atlas_semantic_concepts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy atlas_semantic_evidence_select_own on public.atlas_semantic_evidence
  for select to authenticated using ((select auth.uid()) = user_id);
create policy atlas_semantic_relationships_select_own on public.atlas_semantic_relationships
  for select to authenticated using ((select auth.uid()) = user_id);

create index if not exists atlas_semantic_sources_queue_idx
  on public.atlas_semantic_sources (user_id, status, source_revision_at desc);
create index if not exists atlas_semantic_concepts_rank_idx
  on public.atlas_semantic_concepts (user_id, source_count desc, evidence_count desc, work_count desc, last_seen_at desc);
create index if not exists atlas_semantic_evidence_source_idx
  on public.atlas_semantic_evidence (user_id, source_type, source_id);
create index if not exists atlas_semantic_evidence_work_idx
  on public.atlas_semantic_evidence (user_id, work_id) where work_id is not null;
create index if not exists atlas_semantic_relationships_rank_idx
  on public.atlas_semantic_relationships (user_id, shared_source_count desc, shared_work_count desc, evidence_count desc);

create or replace function public.atlas_semantic_rebuild_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.atlas_semantic_concepts c
  where c.user_id = p_user_id
    and not exists (
      select 1 from public.atlas_semantic_evidence e
      where e.user_id = p_user_id and e.concept_id = c.id
    );

  update public.atlas_semantic_concepts c
  set evidence_count = x.evidence_count,
      source_count = x.source_count,
      work_count = x.work_count,
      first_seen_at = x.first_seen_at,
      last_seen_at = x.last_seen_at,
      updated_at = now()
  from (
    select
      e.concept_id,
      count(*)::integer as evidence_count,
      count(distinct (e.source_type || ':' || e.source_id::text))::integer as source_count,
      count(distinct e.work_id) filter (where e.work_id is not null)::integer as work_count,
      min(e.source_revision_at) as first_seen_at,
      max(e.source_revision_at) as last_seen_at
    from public.atlas_semantic_evidence e
    where e.user_id = p_user_id
    group by e.concept_id
  ) x
  where c.id = x.concept_id and c.user_id = p_user_id;

  delete from public.atlas_semantic_relationships where user_id = p_user_id;

  insert into public.atlas_semantic_relationships (
    user_id, left_concept_id, right_concept_id, relationship_type,
    shared_source_count, shared_work_count, evidence_count,
    first_seen_at, last_seen_at, created_at, updated_at
  )
  select
    p_user_id,
    e1.concept_id,
    e2.concept_id,
    'co_occurs_in_memory',
    count(distinct case
      when e1.source_type = e2.source_type and e1.source_id = e2.source_id
      then e1.source_type || ':' || e1.source_id::text end)::integer,
    count(distinct case
      when e1.work_id is not null and e1.work_id = e2.work_id then e1.work_id end)::integer,
    (
      count(distinct case
        when e1.source_type = e2.source_type and e1.source_id = e2.source_id
        then e1.source_type || ':' || e1.source_id::text end)
      + count(distinct case
        when e1.work_id is not null and e1.work_id = e2.work_id then 'work:' || e1.work_id end)
    )::integer,
    min(greatest(e1.source_revision_at, e2.source_revision_at)),
    max(greatest(e1.source_revision_at, e2.source_revision_at)),
    now(), now()
  from public.atlas_semantic_evidence e1
  join public.atlas_semantic_evidence e2
    on e2.user_id = e1.user_id
   and e1.concept_id < e2.concept_id
   and (
     (e1.source_type = e2.source_type and e1.source_id = e2.source_id)
     or (e1.work_id is not null and e1.work_id = e2.work_id)
   )
  where e1.user_id = p_user_id
  group by e1.concept_id, e2.concept_id;
end;
$$;

revoke all on function public.atlas_semantic_rebuild_for_user(uuid) from public, anon, authenticated;
grant execute on function public.atlas_semantic_rebuild_for_user(uuid) to service_role;

create or replace function public.atlas_semantic_queue_annotation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_source_id uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_source_id := old.id;
    delete from public.atlas_semantic_evidence
      where user_id = v_user_id and source_type = 'annotation' and source_id = v_source_id;
    delete from public.atlas_semantic_sources
      where user_id = v_user_id and source_type = 'annotation' and source_id = v_source_id;
    perform public.atlas_semantic_rebuild_for_user(v_user_id);
    return old;
  end if;

  insert into public.atlas_semantic_sources (
    user_id, source_type, source_id, source_revision_at, status,
    attempt_count, last_error, processed_at, updated_at
  ) values (
    new.user_id, 'annotation', new.id, new.updated_at, 'pending',
    0, null, null, now()
  )
  on conflict (user_id, source_type, source_id) do update
  set source_revision_at = excluded.source_revision_at,
      status = 'pending', attempt_count = 0, last_error = null,
      processed_at = null, updated_at = now();

  insert into public.atlas_semantic_sources (
    user_id, source_type, source_id, source_revision_at, status,
    attempt_count, last_error, processed_at, updated_at
  )
  select tt.user_id, 'thread', tt.id, now(), 'pending', 0, null, null, now()
  from public.thought_thread_items ti
  join public.thought_threads tt on tt.id = ti.thread_id and tt.user_id = ti.user_id
  where ti.annotation_id = new.id and ti.user_id = new.user_id
  on conflict (user_id, source_type, source_id) do update
  set source_revision_at = excluded.source_revision_at,
      status = 'pending', attempt_count = 0, last_error = null,
      processed_at = null, updated_at = now();

  return new;
end;
$$;

create or replace function public.atlas_semantic_queue_thread()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.atlas_semantic_evidence
      where user_id = old.user_id and source_type = 'thread' and source_id = old.id;
    delete from public.atlas_semantic_sources
      where user_id = old.user_id and source_type = 'thread' and source_id = old.id;
    perform public.atlas_semantic_rebuild_for_user(old.user_id);
    return old;
  end if;

  insert into public.atlas_semantic_sources (
    user_id, source_type, source_id, source_revision_at, status,
    attempt_count, last_error, processed_at, updated_at
  ) values (
    new.user_id, 'thread', new.id, new.updated_at, 'pending',
    0, null, null, now()
  )
  on conflict (user_id, source_type, source_id) do update
  set source_revision_at = excluded.source_revision_at,
      status = 'pending', attempt_count = 0, last_error = null,
      processed_at = null, updated_at = now();
  return new;
end;
$$;

create or replace function public.atlas_semantic_queue_thread_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread_id uuid := case when tg_op = 'DELETE' then old.thread_id else new.thread_id end;
  v_user_id uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  insert into public.atlas_semantic_sources (
    user_id, source_type, source_id, source_revision_at, status,
    attempt_count, last_error, processed_at, updated_at
  )
  select tt.user_id, 'thread', tt.id, now(), 'pending', 0, null, null, now()
  from public.thought_threads tt
  where tt.id = v_thread_id and tt.user_id = v_user_id
  on conflict (user_id, source_type, source_id) do update
  set source_revision_at = excluded.source_revision_at,
      status = 'pending', attempt_count = 0, last_error = null,
      processed_at = null, updated_at = now();
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.atlas_semantic_queue_annotation() from public, anon, authenticated;
revoke all on function public.atlas_semantic_queue_thread() from public, anon, authenticated;
revoke all on function public.atlas_semantic_queue_thread_item() from public, anon, authenticated;

drop trigger if exists atlas_semantic_annotations_trg on public.annotations;
create trigger atlas_semantic_annotations_trg
after insert or update of quote_text, note_text, book_title, author, updated_at or delete on public.annotations
for each row execute function public.atlas_semantic_queue_annotation();

drop trigger if exists atlas_semantic_threads_trg on public.thought_threads;
create trigger atlas_semantic_threads_trg
after insert or update of title, question, synthesis_note, updated_at or delete on public.thought_threads
for each row execute function public.atlas_semantic_queue_thread();

drop trigger if exists atlas_semantic_thread_items_trg on public.thought_thread_items;
create trigger atlas_semantic_thread_items_trg
after insert or delete on public.thought_thread_items
for each row execute function public.atlas_semantic_queue_thread_item();

create or replace function public.atlas_claim_semantic_batch(p_user_id uuid, p_limit integer default 12)
returns table (
  source_type text,
  source_id uuid,
  source_revision_at timestamptz,
  work_id text,
  content jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select s.user_id, s.source_type, s.source_id, s.source_revision_at
    from public.atlas_semantic_sources s
    where s.user_id = p_user_id
      and s.attempt_count < 3
      and (
        s.status in ('pending', 'failed')
        or (s.status = 'processing' and s.updated_at < now() - interval '15 minutes')
      )
    order by s.source_revision_at desc
    limit greatest(1, least(coalesce(p_limit, 12), 20))
    for update skip locked
  ), claimed as (
    update public.atlas_semantic_sources s
    set status = 'processing',
        attempt_count = s.attempt_count + 1,
        last_error = null,
        updated_at = now()
    from candidates c
    where s.user_id = c.user_id and s.source_type = c.source_type and s.source_id = c.source_id
    returning s.user_id, s.source_type, s.source_id, s.source_revision_at
  )
  select
    c.source_type,
    c.source_id,
    c.source_revision_at,
    case when c.source_type = 'annotation' then a.work_id else null end as work_id,
    case
      when c.source_type = 'annotation' then jsonb_build_object(
        'book_title', a.book_title,
        'author', a.author,
        'quote', left(coalesce(a.quote_text, ''), 3200),
        'note', left(coalesce(a.note_text, ''), 1800)
      )
      else jsonb_build_object(
        'title', tt.title,
        'question', tt.question,
        'synthesis', tt.synthesis_note,
        'evidence', coalesce((
          select jsonb_agg(x.item)
          from (
            select jsonb_build_object(
              'book_title', a2.book_title,
              'author', a2.author,
              'quote', left(coalesce(a2.quote_text, ''), 900),
              'note', left(coalesce(a2.note_text, ''), 500)
            ) as item
            from public.thought_thread_items ti2
            join public.annotations a2 on a2.id = ti2.annotation_id and a2.user_id = ti2.user_id
            where ti2.thread_id = c.source_id and ti2.user_id = c.user_id
            order by ti2.position asc, ti2.created_at asc
            limit 4
          ) x
        ), '[]'::jsonb)
      )
    end as content
  from claimed c
  left join public.annotations a
    on c.source_type = 'annotation' and a.id = c.source_id and a.user_id = c.user_id
  left join public.thought_threads tt
    on c.source_type = 'thread' and tt.id = c.source_id and tt.user_id = c.user_id
  where (c.source_type = 'annotation' and a.id is not null)
     or (c.source_type = 'thread' and tt.id is not null);
end;
$$;

revoke all on function public.atlas_claim_semantic_batch(uuid, integer) from public, anon, authenticated;
grant execute on function public.atlas_claim_semantic_batch(uuid, integer) to service_role;

create or replace function public.atlas_release_semantic_claims(p_user_id uuid, p_sources jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.atlas_semantic_sources s
  set status = 'pending',
      attempt_count = greatest(s.attempt_count - 1, 0),
      last_error = null,
      updated_at = now()
  where s.user_id = p_user_id
    and s.status = 'processing'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) x
      where x ->> 'source_type' = s.source_type
        and (x ->> 'source_id')::uuid = s.source_id
    );
$$;

revoke all on function public.atlas_release_semantic_claims(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.atlas_release_semantic_claims(uuid, jsonb) to service_role;

create or replace function public.atlas_apply_semantic_extraction(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_revision_at timestamptz,
  p_entities jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.atlas_semantic_sources%rowtype;
  v_work_id text;
  v_entity jsonb;
  v_concept_id uuid;
  v_entity_type text;
  v_key text;
  v_label_en text;
  v_label_ru text;
  v_excerpt text;
  v_confidence numeric;
begin
  select * into v_source
  from public.atlas_semantic_sources s
  where s.user_id = p_user_id and s.source_type = p_source_type and s.source_id = p_source_id
  for update;

  if not found or v_source.status <> 'processing' or v_source.source_revision_at is distinct from p_source_revision_at then
    return false;
  end if;

  if p_source_type = 'annotation' then
    select a.work_id into v_work_id
    from public.annotations a
    where a.id = p_source_id and a.user_id = p_user_id;
    if not found then return false; end if;
  elsif p_source_type = 'thread' then
    if not exists (select 1 from public.thought_threads tt where tt.id = p_source_id and tt.user_id = p_user_id) then
      return false;
    end if;
    v_work_id := null;
  else
    return false;
  end if;

  delete from public.atlas_semantic_evidence
  where user_id = p_user_id and source_type = p_source_type and source_id = p_source_id;

  for v_entity in select value from jsonb_array_elements(coalesce(p_entities, '[]'::jsonb))
  loop
    v_entity_type := lower(btrim(coalesce(v_entity ->> 'type', '')));
    v_key := lower(btrim(coalesce(v_entity ->> 'canonical_key', '')));
    v_label_en := btrim(coalesce(v_entity ->> 'label_en', ''));
    v_label_ru := btrim(coalesce(v_entity ->> 'label_ru', ''));
    v_excerpt := nullif(btrim(coalesce(v_entity ->> 'evidence', '')), '');
    begin
      v_confidence := (v_entity ->> 'confidence')::numeric;
    exception when others then
      v_confidence := 0;
    end;

    if v_entity_type not in ('concept', 'person')
       or v_key !~ '^[a-z0-9][a-z0-9-]{0,79}$'
       or v_label_en = '' or v_label_ru = ''
       or v_confidence < 0.72 or v_confidence > 1 then
      continue;
    end if;

    insert into public.atlas_semantic_concepts (
      user_id, entity_type, canonical_key, label_en, label_ru,
      first_seen_at, last_seen_at, created_at, updated_at
    ) values (
      p_user_id, v_entity_type, v_key, v_label_en, v_label_ru,
      p_source_revision_at, p_source_revision_at, now(), now()
    )
    on conflict (user_id, entity_type, canonical_key) do update
    set label_en = excluded.label_en,
        label_ru = excluded.label_ru,
        updated_at = now()
    returning id into v_concept_id;

    insert into public.atlas_semantic_evidence (
      user_id, concept_id, source_type, source_id, work_id,
      excerpt, confidence, source_revision_at, created_at, updated_at
    ) values (
      p_user_id, v_concept_id, p_source_type, p_source_id, v_work_id,
      left(v_excerpt, 600), v_confidence, p_source_revision_at, now(), now()
    )
    on conflict (user_id, concept_id, source_type, source_id) do update
    set work_id = excluded.work_id,
        excerpt = excluded.excerpt,
        confidence = excluded.confidence,
        source_revision_at = excluded.source_revision_at,
        updated_at = now();
  end loop;

  update public.atlas_semantic_sources
  set status = 'processed', processed_at = now(), last_error = null, updated_at = now()
  where user_id = p_user_id and source_type = p_source_type and source_id = p_source_id;

  perform public.atlas_semantic_rebuild_for_user(p_user_id);
  return true;
end;
$$;

revoke all on function public.atlas_apply_semantic_extraction(uuid, text, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.atlas_apply_semantic_extraction(uuid, text, uuid, timestamptz, jsonb) to service_role;

create or replace function public.atlas_fail_semantic_source(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_revision_at timestamptz,
  p_error text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.atlas_semantic_sources
  set status = case when attempt_count >= 3 then 'failed' else 'pending' end,
      last_error = left(coalesce(p_error, 'semantic extraction failed'), 800),
      updated_at = now()
  where user_id = p_user_id
    and source_type = p_source_type
    and source_id = p_source_id
    and source_revision_at = p_source_revision_at;
$$;

revoke all on function public.atlas_fail_semantic_source(uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.atlas_fail_semantic_source(uuid, text, uuid, timestamptz, text) to service_role;

create or replace function public.consume_ai_allowance(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text;
  v_bucket text;
  v_month_start timestamptz;
  v_hour_start timestamptz;
  v_monthly_limit integer;
  v_hourly_limit integer;
  v_monthly_used integer;
  v_hourly_used integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'AK010';
  end if;

  v_bucket := case p_action
    when 'translate' then 'reader_ai'
    when 'explain' then 'reader_ai'
    when 'reveal' then 'reader_ai'
    when 'atlas-question' then 'atlas_ai'
    when 'atlas-contradictions' then 'atlas_ai'
    when 'atlas-unfinished-lines' then 'atlas_ai'
    when 'atlas-semantic-index' then 'atlas_ai'
    else null
  end;

  if v_bucket is null then
    return jsonb_build_object('allowed', false, 'reason', 'configuration_error', 'plan', null, 'bucket', null, 'used', null, 'limit', null, 'resets_at', null);
  end if;

  v_plan := public.effective_plan_for_user(v_user_id);

  select monthly_limit, hourly_limit into v_monthly_limit, v_hourly_limit
  from public.ai_plan_limits where plan = v_plan and bucket = v_bucket;

  if v_monthly_limit is null or v_hourly_limit is null then
    return jsonb_build_object('allowed', false, 'reason', 'configuration_error', 'plan', v_plan, 'bucket', v_bucket, 'used', null, 'limit', null, 'resets_at', null);
  end if;

  v_month_start := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_hour_start := date_trunc('hour', now() at time zone 'utc') at time zone 'utc';

  insert into public.ai_usage_monthly (user_id, period_start, bucket, used)
  values (v_user_id, v_month_start, v_bucket, 0)
  on conflict (user_id, period_start, bucket) do nothing;

  insert into public.ai_usage_hourly (user_id, period_start, bucket, used)
  values (v_user_id, v_hour_start, v_bucket, 0)
  on conflict (user_id, period_start, bucket) do nothing;

  select used into v_monthly_used from public.ai_usage_monthly
  where user_id = v_user_id and period_start = v_month_start and bucket = v_bucket for update;

  select used into v_hourly_used from public.ai_usage_hourly
  where user_id = v_user_id and period_start = v_hour_start and bucket = v_bucket for update;

  if v_monthly_used >= v_monthly_limit then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_limit_reached', 'plan', v_plan, 'bucket', v_bucket, 'used', v_monthly_used, 'limit', v_monthly_limit, 'resets_at', v_month_start + interval '1 month');
  end if;

  if v_hourly_used >= v_hourly_limit then
    return jsonb_build_object('allowed', false, 'reason', 'hourly_limit_reached', 'plan', v_plan, 'bucket', v_bucket, 'used', v_hourly_used, 'limit', v_hourly_limit, 'resets_at', v_hour_start + interval '1 hour');
  end if;

  update public.ai_usage_monthly set used = used + 1, updated_at = now()
  where user_id = v_user_id and period_start = v_month_start and bucket = v_bucket;

  update public.ai_usage_hourly set used = used + 1, updated_at = now()
  where user_id = v_user_id and period_start = v_hour_start and bucket = v_bucket;

  return jsonb_build_object('allowed', true, 'reason', 'ok', 'plan', v_plan, 'bucket', v_bucket, 'used', v_monthly_used + 1, 'limit', v_monthly_limit, 'resets_at', v_month_start + interval '1 month');
end;
$$;

insert into public.atlas_semantic_sources (
  user_id, source_type, source_id, source_revision_at, status, attempt_count, updated_at
)
select a.user_id, 'annotation', a.id, a.updated_at, 'pending', 0, now()
from public.annotations a
on conflict (user_id, source_type, source_id) do nothing;

insert into public.atlas_semantic_sources (
  user_id, source_type, source_id, source_revision_at, status, attempt_count, updated_at
)
select tt.user_id, 'thread', tt.id, tt.updated_at, 'pending', 0, now()
from public.thought_threads tt
on conflict (user_id, source_type, source_id) do nothing;
