-- AESTESIS PARALLEL BILLING SAFETY v1
-- Keep the existing flat get_my_billing_snapshot() unchanged for deployed
-- clients. Add a v2 snapshot for future Aestesis-aware UI, and ensure the
-- existing change-subscription resolver can only ever select a ladder plan.

create or replace function public.get_my_active_paddle_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'AK010';
  end if;

  select
    provider_subscription_id,
    plan,
    billing_interval,
    status,
    cancel_at_period_end,
    coalesce(
      provider_payload #>> '{data,scheduled_change,action}',
      provider_payload #>> '{scheduled_change,action}'
    ) as scheduled_change_action
    into v_row
  from public.billing_subscriptions
  where user_id = v_user_id
    and plan in ('library','atlas','academy')
    and status in ('active','trialing','past_due')
  order by updated_at desc
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'subscription_id',v_row.provider_subscription_id,
    'plan',v_row.plan,
    'billing_interval',v_row.billing_interval,
    'status',v_row.status,
    'cancel_at_period_end',v_row.cancel_at_period_end,
    'scheduled_change_action',v_row.scheduled_change_action
  );
end;
$$;

create or replace function public.get_my_billing_snapshot_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_ladder_row record;
  v_aestesis_row record;
  v_ladder jsonb := null;
  v_aestesis jsonb := null;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'AK010';
  end if;

  select plan,billing_interval,status,current_period_end,cancel_at_period_end,
         coalesce(provider_payload #>> '{data,scheduled_change,action}',provider_payload #>> '{scheduled_change,action}') as scheduled_change_action
    into v_ladder_row
  from public.billing_subscriptions
  where user_id=v_user_id and plan in ('library','atlas','academy')
  order by case when status in ('active','trialing','past_due') then 0 else 1 end, updated_at desc
  limit 1;

  if found then
    v_ladder := jsonb_build_object(
      'plan',v_ladder_row.plan,
      'billing_interval',v_ladder_row.billing_interval,
      'status',v_ladder_row.status,
      'renews_at',v_ladder_row.current_period_end,
      'cancel_at_period_end',v_ladder_row.cancel_at_period_end,
      'scheduled_change_action',v_ladder_row.scheduled_change_action,
      'manage_subscription_available',v_ladder_row.status in ('active','trialing','past_due')
    );
  end if;

  select plan,billing_interval,status,current_period_end,cancel_at_period_end,
         coalesce(provider_payload #>> '{data,scheduled_change,action}',provider_payload #>> '{scheduled_change,action}') as scheduled_change_action
    into v_aestesis_row
  from public.billing_subscriptions
  where user_id=v_user_id and plan='aestesis'
  order by case when status in ('active','trialing','past_due') then 0 else 1 end, updated_at desc
  limit 1;

  if found then
    v_aestesis := jsonb_build_object(
      'plan',v_aestesis_row.plan,
      'billing_interval',v_aestesis_row.billing_interval,
      'status',v_aestesis_row.status,
      'renews_at',v_aestesis_row.current_period_end,
      'cancel_at_period_end',v_aestesis_row.cancel_at_period_end,
      'scheduled_change_action',v_aestesis_row.scheduled_change_action,
      'manage_subscription_available',v_aestesis_row.status in ('active','trialing','past_due')
    );
  end if;

  return jsonb_build_object(
    'provider','paddle',
    'ladder_subscription',v_ladder,
    'aestesis_subscription',v_aestesis
  );
end;
$$;

revoke all on function public.get_my_billing_snapshot_v2() from public, anon;
grant execute on function public.get_my_billing_snapshot_v2() to authenticated, service_role;
