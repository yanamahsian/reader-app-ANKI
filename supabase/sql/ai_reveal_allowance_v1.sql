-- Reader Reveal joins Translate/Explain in the existing reader_ai bucket.
-- No quota numbers change here; this only maps the new server-owned action
-- to the already-configured per-plan reader_ai allowance.
create or replace function public.consume_ai_allowance(p_action text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  where user_id = v_user_id and period_start = v_month_start and bucket = v_bucket
  for update;

  select used into v_hourly_used
  from public.ai_usage_hourly
  where user_id = v_user_id and period_start = v_hour_start and bucket = v_bucket
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
  set used = used + 1, updated_at = now()
  where user_id = v_user_id and period_start = v_month_start and bucket = v_bucket;

  update public.ai_usage_hourly
  set used = used + 1, updated_at = now()
  where user_id = v_user_id and period_start = v_hour_start and bucket = v_bucket;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'ok',
    'plan', v_plan,
    'bucket', v_bucket,
    'used', v_monthly_used + 1,
    'limit', v_monthly_limit,
    'resets_at', v_month_start + interval '1 month'
  );
end;
$function$;
