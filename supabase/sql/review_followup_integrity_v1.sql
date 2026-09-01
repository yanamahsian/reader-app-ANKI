-- Follow-up fixes from the independent Reader/Atlas review.
-- H1: make Atlas semantic AI allowance refundable when the upstream extraction
-- itself fails before any usable semantic result is produced.
-- M4: serialize deterministic Atlas graph rebuilds per user.

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
    return jsonb_build_object(
      'allowed', false,
      'reason', 'configuration_error',
      'plan', null,
      'bucket', null,
      'used', null,
      'limit', null,
      'resets_at', null
    );
  end if;

  v_plan := public.effective_plan_for_user(v_user_id);

  select monthly_limit, hourly_limit
    into v_monthly_limit, v_hourly_limit
  from public.ai_plan_limits
  where plan = v_plan and bucket = v_bucket;

  if v_monthly_limit is null or v_hourly_limit is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'configuration_error',
      'plan', v_plan,
      'bucket', v_bucket,
      'used', null,
      'limit', null,
      'resets_at', null
    );
  end if;

  v_month_start := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_hour_start := date_trunc('hour', now() at time zone 'utc') at time zone 'utc';

  insert into public.ai_usage_monthly (user_id, period_start, bucket, used)
  values (v_user_id, v_month_start, v_bucket, 0)
  on conflict (user_id, period_start, bucket) do nothing;

  insert into public.ai_usage_hourly (user_id, period_start, bucket, used)
  values (v_user_id, v_hour_start, v_bucket, 0)
  on conflict (user_id, period_start, bucket) do nothing;

  select used into v_monthly_used
  from public.ai_usage_monthly
  where user_id = v_user_id
    and period_start = v_month_start
    and bucket = v_bucket
  for update;

  select used into v_hourly_used
  from public.ai_usage_hourly
  where user_id = v_user_id
    and period_start = v_hour_start
    and bucket = v_bucket
  for update;

  if v_monthly_used >= v_monthly_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_limit_reached',
      'plan', v_plan,
      'bucket', v_bucket,
      'used', v_monthly_used,
      'limit', v_monthly_limit,
      'resets_at', v_month_start + interval '1 month'
    );
  end if;

  if v_hourly_used >= v_hourly_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'hourly_limit_reached',
      'plan', v_plan,
      'bucket', v_bucket,
      'used', v_hourly_used,
      'limit', v_hourly_limit,
      'resets_at', v_hour_start + interval '1 hour'
    );
  end if;

  update public.ai_usage_monthly
  set used = used + 1,
      updated_at = now()
  where user_id = v_user_id
    and period_start = v_month_start
    and bucket = v_bucket;

  update public.ai_usage_hourly
  set used = used + 1,
      updated_at = now()
  where user_id = v_user_id
    and period_start = v_hour_start
    and bucket = v_bucket;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'ok',
    'plan', v_plan,
    'bucket', v_bucket,
    'used', v_monthly_used + 1,
    'limit', v_monthly_limit,
    'resets_at', v_month_start + interval '1 month',
    'month_period_start', v_month_start,
    'hour_period_start', v_hour_start
  );
end;
$$;

create or replace function public.refund_ai_allowance_for_user(
  p_user_id uuid,
  p_bucket text,
  p_month_period_start timestamptz,
  p_hour_period_start timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_monthly_used integer;
  v_hourly_used integer;
begin
  if p_user_id is null
     or p_bucket not in ('reader_ai', 'atlas_ai')
     or p_month_period_start is null
     or p_hour_period_start is null then
    return false;
  end if;

  select used into v_monthly_used
  from public.ai_usage_monthly
  where user_id = p_user_id
    and period_start = p_month_period_start
    and bucket = p_bucket
  for update;

  if not found or v_monthly_used <= 0 then
    return false;
  end if;

  select used into v_hourly_used
  from public.ai_usage_hourly
  where user_id = p_user_id
    and period_start = p_hour_period_start
    and bucket = p_bucket
  for update;

  if not found or v_hourly_used <= 0 then
    return false;
  end if;

  update public.ai_usage_monthly
  set used = used - 1,
      updated_at = now()
  where user_id = p_user_id
    and period_start = p_month_period_start
    and bucket = p_bucket;

  update public.ai_usage_hourly
  set used = used - 1,
      updated_at = now()
  where user_id = p_user_id
    and period_start = p_hour_period_start
    and bucket = p_bucket;

  return true;
end;
$$;

revoke all on function public.refund_ai_allowance_for_user(uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.refund_ai_allowance_for_user(uuid, text, timestamptz, timestamptz)
  to service_role;

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

  insert into public.atlas_graph_state (user_id, dirty, updated_at)
  values (v_user_id, true, now())
  on conflict (user_id) do nothing;

  select s.dirty into v_dirty
  from public.atlas_graph_state s
  where s.user_id = v_user_id
  for update;

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
