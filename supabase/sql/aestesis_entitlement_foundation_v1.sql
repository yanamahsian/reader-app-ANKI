-- AESTESIS ENTITLEMENT FOUNDATION v1
-- Aestesis is parallel to the cumulative Free -> Library -> Atlas -> Academy
-- ladder. It is never ranked as a fifth ladder tier.

alter table public.entitlement_grants
  drop constraint if exists entitlement_grants_plan_check;
alter table public.entitlement_grants
  add constraint entitlement_grants_plan_check
  check (plan = any (array['free'::text,'library'::text,'atlas'::text,'academy'::text,'aestesis'::text]));

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_plan_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_plan_check
  check (plan = any (array['library'::text,'atlas'::text,'academy'::text,'aestesis'::text]));

alter table public.ai_plan_limits
  drop constraint if exists ai_plan_limits_plan_check;
alter table public.ai_plan_limits
  add constraint ai_plan_limits_plan_check
  check (plan = any (array['free'::text,'library'::text,'atlas'::text,'academy'::text,'aestesis'::text]));

insert into public.ai_plan_limits (plan,bucket,monthly_limit,hourly_limit)
values
  ('aestesis','reader_ai',0,0),
  ('aestesis','atlas_ai',0,0)
on conflict (plan,bucket) do update
set monthly_limit=excluded.monthly_limit,
    hourly_limit=excluded.hourly_limit,
    updated_at=now();

create or replace function public.effective_plan_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select g.plan
      from public.entitlement_grants g
      where g.user_id = p_user_id
        and g.plan in ('free','library','atlas','academy')
        and g.starts_at <= now()
        and (g.ends_at is null or g.ends_at > now())
        and g.revoked_at is null
      order by
        case g.plan
          when 'academy' then 4
          when 'atlas' then 3
          when 'library' then 2
          when 'free' then 1
          else 0
        end desc
      limit 1
    ),
    'free'
  );
$$;

create or replace function public.user_has_aestesis_entitlement(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.entitlement_grants g
    where g.user_id = p_user_id
      and g.plan = 'aestesis'
      and g.starts_at <= now()
      and (g.ends_at is null or g.ends_at > now())
      and g.revoked_at is null
  );
$$;

revoke all on function public.user_has_aestesis_entitlement(uuid) from public, anon, authenticated;
grant execute on function public.user_has_aestesis_entitlement(uuid) to service_role;

create or replace function public.consume_ai_allowance(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_base_plan text;
  v_has_aestesis boolean := false;
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
    return jsonb_build_object('allowed',false,'reason','configuration_error','plan',null,'bucket',null,'used',null,'limit',null,'resets_at',null);
  end if;

  v_base_plan := public.effective_plan_for_user(v_user_id);
  v_has_aestesis := public.user_has_aestesis_entitlement(v_user_id);
  v_plan := case when v_base_plan='free' and v_has_aestesis then 'aestesis' else v_base_plan end;

  select monthly_limit, hourly_limit
    into v_monthly_limit, v_hourly_limit
  from public.ai_plan_limits
  where plan=v_plan and bucket=v_bucket;

  if v_monthly_limit is null or v_hourly_limit is null then
    return jsonb_build_object('allowed',false,'reason','configuration_error','plan',v_plan,'bucket',v_bucket,'used',null,'limit',null,'resets_at',null);
  end if;

  v_month_start := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_hour_start := date_trunc('hour', now() at time zone 'utc') at time zone 'utc';

  insert into public.ai_usage_monthly (user_id,period_start,bucket,used)
  values (v_user_id,v_month_start,v_bucket,0)
  on conflict (user_id,period_start,bucket) do nothing;

  insert into public.ai_usage_hourly (user_id,period_start,bucket,used)
  values (v_user_id,v_hour_start,v_bucket,0)
  on conflict (user_id,period_start,bucket) do nothing;

  select used into v_monthly_used
  from public.ai_usage_monthly
  where user_id=v_user_id and period_start=v_month_start and bucket=v_bucket
  for update;

  select used into v_hourly_used
  from public.ai_usage_hourly
  where user_id=v_user_id and period_start=v_hour_start and bucket=v_bucket
  for update;

  if v_monthly_used >= v_monthly_limit then
    return jsonb_build_object('allowed',false,'reason','monthly_limit_reached','plan',v_plan,'bucket',v_bucket,'used',v_monthly_used,'limit',v_monthly_limit,'resets_at',v_month_start+interval '1 month');
  end if;

  if v_hourly_used >= v_hourly_limit then
    return jsonb_build_object('allowed',false,'reason','hourly_limit_reached','plan',v_plan,'bucket',v_bucket,'used',v_hourly_used,'limit',v_hourly_limit,'resets_at',v_hour_start+interval '1 hour');
  end if;

  update public.ai_usage_monthly
  set used=used+1, updated_at=now()
  where user_id=v_user_id and period_start=v_month_start and bucket=v_bucket;

  update public.ai_usage_hourly
  set used=used+1, updated_at=now()
  where user_id=v_user_id and period_start=v_hour_start and bucket=v_bucket;

  return jsonb_build_object('allowed',true,'reason','ok','plan',v_plan,'bucket',v_bucket,'used',v_monthly_used+1,'limit',v_monthly_limit,'resets_at',v_month_start+interval '1 month','month_period_start',v_month_start,'hour_period_start',v_hour_start);
end;
$$;

create or replace function public.get_my_entitlement_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_base_plan text;
  v_has_aestesis boolean := false;
  v_ai_plan text;
  v_ai_tier_name text;
  v_month_start timestamptz;
  v_reader_limit integer;
  v_atlas_limit integer;
  v_reader_used integer;
  v_atlas_used integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'AK010';
  end if;

  v_base_plan := public.effective_plan_for_user(v_user_id);
  v_has_aestesis := public.user_has_aestesis_entitlement(v_user_id);
  v_ai_plan := case when v_base_plan='free' and v_has_aestesis then 'aestesis' else v_base_plan end;

  v_ai_tier_name := case v_ai_plan
    when 'academy' then 'AI Advanced'
    when 'atlas' then 'AI Extended'
    when 'library' then 'AI Standard'
    when 'aestesis' then 'Не входит в план'
    else 'AI Preview'
  end;

  v_month_start := date_trunc('month', now() at time zone 'utc') at time zone 'utc';

  select monthly_limit into v_reader_limit from public.ai_plan_limits where plan=v_ai_plan and bucket='reader_ai';
  select monthly_limit into v_atlas_limit from public.ai_plan_limits where plan=v_ai_plan and bucket='atlas_ai';
  select used into v_reader_used from public.ai_usage_monthly where user_id=v_user_id and period_start=v_month_start and bucket='reader_ai';
  select used into v_atlas_used from public.ai_usage_monthly where user_id=v_user_id and period_start=v_month_start and bucket='atlas_ai';

  return jsonb_build_object(
    'effective_plan',v_base_plan,
    'has_aestesis',v_has_aestesis,
    'ai_tier_name',v_ai_tier_name,
    'reader_ai',jsonb_build_object('used',coalesce(v_reader_used,0),'monthly_limit',v_reader_limit,'reset_at',v_month_start+interval '1 month'),
    'atlas_ai',jsonb_build_object('used',coalesce(v_atlas_used,0),'monthly_limit',v_atlas_limit,'reset_at',v_month_start+interval '1 month')
  );
end;
$$;
