-- PAYMENTS & SUBSCRIPTION LIFECYCLE v1 (Paddle Billing) -- new, additive
-- migration. Builds strictly on top of the PRODUCTION-LIVE
-- ai_entitlements_foundation_v1.sql (entitlement_grants, effective_plan_for_
-- user, ai_plan_limits, ai_usage_monthly/hourly, consume_ai_allowance,
-- get_my_entitlement_snapshot) WITHOUT rewriting or renaming a single object
-- from that file. That file is not touched by this migration at all.
--
-- WHAT THIS FILE DOES NOT DO, ON PURPOSE:
--   * It does not create a second/parallel entitlement mechanism. Paddle
--     grants access through the EXISTING public.entitlement_grants table,
--     tagged source='paddle', exactly like any other grant source
--     (trial/pass_it_forward/founding_membership would be source values in
--     that same table, never separate tables of their own -- product
--     architecture section 14/16, and instruction 34 of this task).
--   * It does not let Paddle become a second source of truth for Reader/
--     Atlas/AI access. omnia-ai continues to read ONLY effective_plan_for_
--     user() + ai_plan_limits, exactly as before -- this file adds no
--     dependency in that direction, and supabase/functions/omnia-ai/
--     index.ts is not edited by this task at all (see instruction 35/44).
--   * It does not hardcode Paddle price ids, product ids, or plan/price
--     mapping into SQL. That mapping is server-owned CONFIGURATION in the
--     paddle-checkout/paddle-webhook Edge Function source (Sandbox ids are
--     public configuration, not secrets), never inferred here from a client
--     payload, product name, or amount.
--
-- TWO NEW LAYERS, DELIBERATELY KEPT SEPARATE:
--   1. BILLING REFLECTION (public.billing_subscriptions,
--      public.billing_webhook_events) -- a local mirror of Paddle's own
--      subscription/event state, for idempotency, audit, and UI display
--      (get_my_billing_snapshot). This layer does NOT itself control
--      Reader/Atlas/AI access.
--   2. ENTITLEMENT (the existing public.entitlement_grants, minimally
--      extended with `external_ref`) -- the ONLY layer that actually
--      controls access, exactly as before. A verified Paddle webhook event
--      updates layer 1 and layer 2 together, atomically, in one RPC
--      (apply_paddle_subscription_event) -- never 2/3/5 independent REST
--      writes that could leave the two layers inconsistent if interrupted
--      partway through.
--
-- WHY external_ref, NOT PARSING entitlement_grants.metadata:
-- source='paddle' alone cannot distinguish "this grant belongs to Paddle
-- subscription sub_A" from "this grant belongs to Paddle subscription
-- sub_B" -- a real visitor could in principle have had more than one
-- Paddle subscription over time (cancelled and resubscribed). A plain text
-- column with its own partial unique index (source, external_ref) where
-- external_ref is not null is a normal, indexable, constraint-enforceable
-- column -- reaching into jsonb metadata for the SAME job would be strictly
-- worse (no unique constraint possible, no index, easy to get wrong) for
-- no benefit. The partial index (not a plain unique index on the whole
-- table) is what lets every OTHER grant source, including rows that leave
-- external_ref null entirely (trial/pass_it_forward/founding/manual), keep
-- working completely unaffected.
--
-- IDENTITY: the only user identity a webhook event is ever allowed to act
-- on is the UUID Paddle hands back verbatim in the checkout's own
-- custom_data.anki_user_id (see paddle-checkout, which is the only thing
-- that ever WRITES custom_data on a Paddle transaction). Email is never a
-- lookup key anywhere in this file.
--
-- SAFETY-CRITICAL LIFECYCLE NUANCES enforced inside
-- apply_paddle_subscription_event (see that function's own header comment
-- for the full reasoning):
--   * Cancel-at-period-end must not instantly downgrade access -- Paddle's
--     own subscription.status honestly stays 'active' until the paid
--     period truly ends (confirmed against developer.paddle.com/build/
--     lifecycle/subscription-cancellation: "subscription remains active
--     until the next billing date, when the subscription status changes to
--     canceled"), so this file drives entitlement purely from the
--     provider's own status + current_period_end -- no separate frontend-
--     visible "cancel now" heuristic is needed or implemented.
--   * A single failed renewal (status='past_due') must not prematurely
--     revoke access -- Paddle keeps retrying while status stays 'past_due'
--     (confirmed: "You can't make changes to a subscription if... the
--     subscription status is past_due", i.e. past_due is Paddle's own
--     distinct, non-terminal status). Access follows status, not a single
--     payment event.
--   * Out-of-order webhook delivery can never roll billing_subscriptions
--     state backward -- the provider's own occurred_at is compared against
--     the subscription row's last-applied event timestamp before any write.
--
-- ==========================================================================
-- 0. MINIMAL, ADDITIVE EXTENSION OF THE EXISTING PRODUCTION TABLE
-- ==========================================================================
-- Idempotent (IF NOT EXISTS on both statements) so this file is safe to
-- re-run, matching this repository's existing migration convention.
alter table public.entitlement_grants
  add column if not exists external_ref text;

comment on column public.entitlement_grants.external_ref is
  'Provider-specific idempotency key for a non-manual grant source, e.g. a '
  'Paddle subscription id when source=''paddle''. Null for grant sources '
  '(manual/trial/pass_it_forward/founding_membership) that have no natural '
  'external id. Never a lookup key on its own -- always paired with '
  '`source` via the partial unique index below.';

create unique index if not exists entitlement_grants_source_external_ref_key
  on public.entitlement_grants (source, external_ref)
  where external_ref is not null;

-- ==========================================================================
-- 1. BILLING SUBSCRIPTIONS -- local reflection of one Paddle subscription
-- ==========================================================================
-- One row per Paddle subscription (provider_subscription_id unique). This
-- table is a REFLECTION of provider state for idempotency/audit/UI display
-- -- it is not itself consulted by effective_plan_for_user() or omnia-ai.
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'paddle'),
  provider_customer_id text,
  provider_subscription_id text not null unique,
  provider_product_id text,
  provider_price_id text not null,
  -- Free is not a Paddle product (section 7 of the task) -- only the three
  -- paid tiers can ever appear here.
  plan text not null check (plan in ('library', 'atlas', 'academy')),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  -- Free text, not a hard-coded enum: stores Paddle's own subscription
  -- status verbatim (active/trialing/past_due/paused/canceled, confirmed
  -- against developer.paddle.com's own webhook payload documentation).
  -- Left open rather than CHECK-constrained to a fixed list so a future,
  -- currently-unanticipated Paddle status cannot make this INSERT/UPDATE
  -- itself fail -- apply_paddle_subscription_event below is the one place
  -- that decides which statuses grant access, via an explicit allow-list,
  -- not this constraint.
  status text not null check (btrim(status) <> ''),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  ended_at timestamptz,
  -- The provider's own event `occurred_at` for the most recent event this
  -- row has actually applied -- the out-of-order guard in
  -- apply_paddle_subscription_event compares a new event's occurred_at
  -- against this before writing anything.
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Optional, bounded raw reflection of the provider's own subscription
  -- object, for support/debugging only -- never secrets or card data
  -- (Paddle, as Merchant of Record, never sends AN.KI card/payment-method
  -- data in the first place).
  provider_payload jsonb
);

create index if not exists billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id);

alter table public.billing_subscriptions enable row level security;
-- No policies are added -- RLS enabled + zero policies + an explicit
-- revoke is this schema's established deny-all pattern (see
-- entitlement_grants, ai_plan_limits, ai_usage_monthly/hourly in
-- ai_entitlements_foundation_v1.sql). The browser never reads this table
-- directly, not even its own row -- get_my_billing_snapshot() below is the
-- one safe, narrow read path.
revoke all privileges on table public.billing_subscriptions from anon, authenticated;

-- ==========================================================================
-- 2. BILLING WEBHOOK EVENTS -- append-only ledger, the idempotency boundary
-- ==========================================================================
create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'paddle'),
  -- Paddle's own event_id (evt_...) -- the stable identifier for "this
  -- exact event", independent of how many times Paddle redelivers the
  -- same notification. Combined with `provider`, this is the sole
  -- idempotency key: apply_paddle_subscription_event's very first act is
  -- an INSERT ... ON CONFLICT DO NOTHING against this unique pair, so the
  -- Nth delivery of the same event is detected before any other table is
  -- touched.
  provider_event_id text not null,
  event_type text not null,
  -- Paddle's own event timestamp, used by apply_paddle_subscription_event
  -- to reject a genuinely out-of-order delivery -- never the time this row
  -- was received, which says nothing about delivery order.
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored_stale', 'ignored_unknown_user', 'ignored_unknown_plan')),
  error_code text,
  -- Bounded reflection of the verified webhook body, for debugging a
  -- disputed or unexpected outcome -- Paddle's own payload never contains
  -- card data or API secrets (Paddle is the Merchant of Record and never
  -- hands AN.KI raw payment details), so this is safe to retain.
  payload jsonb,
  unique (provider, provider_event_id)
);

create index if not exists billing_webhook_events_received_at_idx
  on public.billing_webhook_events (received_at);

alter table public.billing_webhook_events enable row level security;
-- Service/server-only, same deny-all pattern as above -- webhook
-- processing never runs with an authenticated browser token, and the
-- browser has no reason to ever read this table.
revoke all privileges on table public.billing_webhook_events from anon, authenticated;

-- ==========================================================================
-- 3. apply_paddle_subscription_event -- the single atomic state transition
-- ==========================================================================
-- Called ONLY from the paddle-webhook Edge Function, AFTER that function
-- has already (a) verified the Paddle-Signature header over the raw
-- request body and (b) parsed/sanity-checked the payload shape. This
-- function is the sole place that actually WRITES billing_subscriptions,
-- billing_webhook_events, and (via entitlement_grants) real product
-- access, all inside the one implicit transaction a single RPC call
-- already is -- never 5 independent REST writes that could leave state
-- half-applied if interrupted partway through.
--
-- SERVICE-ONLY BY CONSTRUCTION: no GRANT EXECUTE is ever issued to `anon`
-- or `authenticated` below (see the revoke at the end of this section) --
-- the exact same pattern effective_plan_for_user() already uses in
-- ai_entitlements_foundation_v1.sql. The paddle-webhook Edge Function
-- calls this using the project's SERVICE_ROLE key (server-only, verified
-- Paddle signature already checked before this call is ever made -- the
-- one place in this codebase where using service_role from an Edge
-- Function is justified, per instruction 27). No client-supplied user_id
-- path exists anywhere else that reaches this function.
--
-- IDEMPOTENCY: the very first statement is an INSERT ... ON CONFLICT (provider,
-- provider_event_id) DO NOTHING against billing_webhook_events. If that
-- insert affects zero rows, this exact event has already been fully
-- processed by an earlier call (Paddle's own at-least-once redelivery) --
-- this function returns immediately with zero further writes. Nothing
-- after that first statement can ever run twice for the same event_id.
--
-- OUT-OF-ORDER SAFETY: after passing the idempotency check, this function
-- takes a transaction-scoped advisory lock keyed on the subscription id
-- (see the pg_advisory_xact_lock call below) BEFORE reading
-- billing_subscriptions -- this is the fix for a genuine concurrency hole
-- an independent review of the first version of this function found (see
-- that call's own comment for the exact race it closes). Only once that
-- lock is held is the target billing_subscriptions row (if it already
-- exists) read, and its last_event_at compared against this event's own
-- occurred_at. An event that is not newer is recorded in the ledger as
-- ignored_stale and never allowed to write billing_subscriptions or
-- entitlement_grants -- state can only move forward in provider time.
--
-- ACCESS DECISION: v_access_active is true for exactly the Paddle
-- subscription statuses that mean "this visitor should keep paid access
-- right now" -- active, trialing, past_due (Paddle is still retrying a
-- failed renewal; instruction 20/§41-F). Every other status (canceled,
-- paused, or any status this function doesn't recognise -- fail closed,
-- never fail open) ends this specific Paddle grant. This function never
-- touches a grant from a different source (trial/pass_it_forward/founding/
-- manual) -- entitlement_grants stays looked up by (source='paddle',
-- external_ref=p_provider_subscription_id) only, so those other sources
-- remain completely independent (instruction 41, Entitlement interaction C).
create or replace function public.apply_paddle_subscription_event(
  p_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_user_id uuid,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_price_id text,
  p_provider_product_id text,
  p_plan text,
  p_billing_interval text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_cancelled_at timestamptz,
  p_ended_at timestamptz,
  p_raw_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ledger_id uuid;
  v_existing_last_event_at timestamptz;
  v_user_exists boolean;
  v_access_active boolean;
  v_grant_ends_at timestamptz;
begin
  -- Defensive shape validation -- structurally shouldn't happen given the
  -- Edge Function's own pre-call validation, but this function is the true
  -- atomic boundary and must not trust any caller, including its own,
  -- blindly. A malformed call raises and the whole transaction (including
  -- the ledger insert below) rolls back, so Paddle's own retry lands on a
  -- clean slate rather than a half-written row.
  if coalesce(btrim(p_event_id), '') = ''
    or coalesce(btrim(p_event_type), '') = ''
    or coalesce(btrim(p_provider_subscription_id), '') = ''
    or coalesce(btrim(p_provider_price_id), '') = ''
    or coalesce(btrim(p_status), '') = ''
    or p_occurred_at is null
  then
    raise exception 'Invalid Paddle event payload' using errcode = 'AK020';
  end if;

  -- IDEMPOTENCY BOUNDARY. On a genuine duplicate delivery, zero rows are
  -- inserted and this function returns immediately below.
  insert into public.billing_webhook_events (
    provider, provider_event_id, event_type, occurred_at, status, payload
  ) values (
    'paddle', p_event_id, p_event_type, p_occurred_at, 'received', p_raw_payload
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return jsonb_build_object('status', 'duplicate_ignored', 'subscription_id', p_provider_subscription_id);
  end if;

  -- CORRECTION (0013) -- BLOCKER FIX: `select ... for update` alone only
  -- serializes concurrent events once a billing_subscriptions row already
  -- exists. For a subscription's FIRST-EVER event, no row exists yet, so
  -- two concurrent deliveries (e.g. an out-of-order retry racing a newer
  -- event, both for a brand-new subscription) would both see zero rows,
  -- both pass the staleness check below (nothing to compare against yet),
  -- and then both reach the INSERT ... ON CONFLICT DO UPDATE further down
  -- -- whichever happens to commit LAST would win, regardless of which
  -- event is actually newer in provider time. An independent review of
  -- the first version of this function (patch 0012) found exactly this
  -- hole. A transaction-scoped advisory lock keyed on the subscription id
  -- closes it: it is acquired here, BEFORE the row is read, and every
  -- concurrent call for the SAME provider_subscription_id -- whether or
  -- not a row exists yet -- is fully serialized through this one point,
  -- never a global lock (a different subscription id hashes to a
  -- different lock key and proceeds independently). pg_advisory_xact_lock
  -- auto-releases at transaction end (commit or rollback) -- no separate
  -- unlock call is needed or correct here.
  perform pg_advisory_xact_lock(hashtextextended('paddle_subscription:' || p_provider_subscription_id, 0));

  -- OUT-OF-ORDER GUARD. Now that concurrent callers for this exact
  -- subscription id are fully serialized by the advisory lock above, this
  -- read (plus its own `for update`, kept as defense in depth for any
  -- writer that reaches this row outside this function) is race-free
  -- regardless of whether a row already existed.
  select last_event_at into v_existing_last_event_at
  from public.billing_subscriptions
  where provider_subscription_id = p_provider_subscription_id
  for update;

  if v_existing_last_event_at is not null and p_occurred_at <= v_existing_last_event_at then
    update public.billing_webhook_events
      set status = 'ignored_stale', processed_at = now()
      where id = v_ledger_id;
    return jsonb_build_object('status', 'ignored_stale', 'subscription_id', p_provider_subscription_id);
  end if;

  -- IDENTITY VALIDATION. p_user_id must be a real auth.users row. An
  -- unknown/deleted user is logged (the ledger row + its raw payload
  -- already capture everything needed to investigate) and safely ignored
  -- -- never an entitlement grant for a user id that doesn't exist.
  if p_user_id is null then
    update public.billing_webhook_events
      set status = 'ignored_unknown_user', processed_at = now()
      where id = v_ledger_id;
    return jsonb_build_object('status', 'ignored_unknown_user', 'subscription_id', p_provider_subscription_id);
  end if;

  select exists(select 1 from auth.users where id = p_user_id) into v_user_exists;
  if not v_user_exists then
    update public.billing_webhook_events
      set status = 'ignored_unknown_user', processed_at = now()
      where id = v_ledger_id;
    return jsonb_build_object('status', 'ignored_unknown_user', 'subscription_id', p_provider_subscription_id);
  end if;

  -- PRICE/PLAN MAPPING VALIDATION. p_plan/p_billing_interval are resolved
  -- server-side by paddle-webhook from its own env-var price map BEFORE
  -- this call -- this is a defense-in-depth re-check, not the primary
  -- mapping authority (that authority is the Edge Function's own
  -- configuration, never this function, and never the client).
  if p_plan not in ('library', 'atlas', 'academy') or p_billing_interval not in ('month', 'year') then
    update public.billing_webhook_events
      set status = 'ignored_unknown_plan', processed_at = now()
      where id = v_ledger_id;
    return jsonb_build_object('status', 'ignored_unknown_plan', 'subscription_id', p_provider_subscription_id);
  end if;

  -- REFLECTION WRITE. Upsert-by-provider_subscription_id -- exactly one
  -- billing_subscriptions row per Paddle subscription, ever (instruction
  -- 22: an upgrade/downgrade/interval change updates this SAME row, never
  -- inserts a second one).
  insert into public.billing_subscriptions (
    user_id, provider, provider_customer_id, provider_subscription_id,
    provider_product_id, provider_price_id, plan, billing_interval, status,
    current_period_start, current_period_end, cancel_at_period_end,
    cancelled_at, ended_at, last_event_at, provider_payload
  ) values (
    p_user_id, 'paddle', p_provider_customer_id, p_provider_subscription_id,
    p_provider_product_id, p_provider_price_id, p_plan, p_billing_interval, p_status,
    p_current_period_start, p_current_period_end, coalesce(p_cancel_at_period_end, false),
    p_cancelled_at, p_ended_at, p_occurred_at, p_raw_payload
  )
  on conflict (provider_subscription_id) do update
    set user_id = excluded.user_id,
        provider_customer_id = excluded.provider_customer_id,
        provider_product_id = excluded.provider_product_id,
        provider_price_id = excluded.provider_price_id,
        plan = excluded.plan,
        billing_interval = excluded.billing_interval,
        status = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        cancelled_at = excluded.cancelled_at,
        ended_at = excluded.ended_at,
        last_event_at = excluded.last_event_at,
        provider_payload = excluded.provider_payload,
        updated_at = now();

  -- ENTITLEMENT WRITE. v_access_active decides whether the Paddle grant
  -- for THIS subscription is (kept) active or ended -- see this function's
  -- own header comment for the exact status allow-list and reasoning.
  v_access_active := p_status in ('active', 'trialing', 'past_due');

  if v_access_active then
    v_grant_ends_at := p_current_period_end;

    insert into public.entitlement_grants (
      user_id, plan, source, starts_at, ends_at, revoked_at, external_ref, metadata
    ) values (
      p_user_id, p_plan, 'paddle', now(), v_grant_ends_at, null, p_provider_subscription_id,
      jsonb_build_object('provider', 'paddle', 'provider_subscription_id', p_provider_subscription_id)
    )
    on conflict (source, external_ref) where external_ref is not null do update
      set plan = excluded.plan,
          ends_at = excluded.ends_at,
          revoked_at = null,
          updated_at = now();
  else
    update public.entitlement_grants
      set revoked_at = coalesce(revoked_at, now()),
          ends_at = coalesce(ends_at, now()),
          updated_at = now()
      where source = 'paddle'
        and external_ref = p_provider_subscription_id
        and revoked_at is null;
  end if;

  update public.billing_webhook_events
    set status = 'processed', processed_at = now()
    where id = v_ledger_id;

  return jsonb_build_object(
    'status', 'processed',
    'subscription_id', p_provider_subscription_id,
    'plan_granted', case when v_access_active then p_plan else null end
  );
end;
$$;

-- No grant to anon/authenticated -- service_role's already-implicit full
-- access (this repository's existing, established convention -- see this
-- migration's own header note and effective_plan_for_user's identical
-- revoke-only pattern) is what lets the paddle-webhook Edge Function call
-- this using the service-role key. A signed-in visitor's own browser
-- session can never call this function.
revoke all on function public.apply_paddle_subscription_event(
  text, text, timestamptz, uuid, text, text, text, text, text, text, text,
  timestamptz, timestamptz, boolean, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;

-- ==========================================================================
-- 4. get_my_billing_snapshot -- the one safe, narrow browser-facing read
-- ==========================================================================
-- auth.uid()-only, no arguments, same shape of guarantee as
-- get_my_entitlement_snapshot() in ai_entitlements_foundation_v1.sql:
-- there is no way to ask this for anyone else's billing state. Returns
-- exactly the fields SubscriptionView needs to render plan/status/renewal/
-- cancel-at-period-end/a "Manage subscription" affordance -- never
-- provider_payload, internal event ids, or any other user's row.
create or replace function public.get_my_billing_snapshot()
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

  -- A visitor could in principle have more than one billing_subscriptions
  -- row over time (e.g. cancelled, then resubscribed later) -- prefer
  -- whichever row currently reflects live/retrying access, else fall back
  -- to the most recently updated row so a lapsed subscriber still sees
  -- their last known state rather than nothing.
  select
    plan,
    billing_interval,
    status,
    current_period_end,
    cancel_at_period_end,
    coalesce(
      provider_payload #>> '{data,scheduled_change,action}',
      provider_payload #>> '{scheduled_change,action}'
    ) as scheduled_change_action
    into v_row
  from public.billing_subscriptions
  where user_id = v_user_id
  order by
    case when status in ('active', 'trialing', 'past_due') then 0 else 1 end,
    updated_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'has_subscription', false,
      'plan', null,
      'billing_interval', null,
      'status', null,
      'renews_at', null,
      'cancel_at_period_end', false,
      'scheduled_change_action', null,
      'provider', 'paddle',
      'manage_subscription_available', false
    );
  end if;

  return jsonb_build_object(
    'has_subscription', true,
    'plan', v_row.plan,
    'billing_interval', v_row.billing_interval,
    'status', v_row.status,
    'renews_at', v_row.current_period_end,
    'cancel_at_period_end', v_row.cancel_at_period_end,
    'scheduled_change_action', v_row.scheduled_change_action,
    'provider', 'paddle',
    'manage_subscription_available', v_row.status in ('active', 'trialing', 'past_due')
  );
end;
$$;

revoke all on function public.get_my_billing_snapshot() from public, anon;
grant execute on function public.get_my_billing_snapshot() to authenticated;

-- ==========================================================================
-- 5. get_my_paddle_customer_id -- narrow internal helper for the "Manage
--    subscription" flow, NEVER a browser-facing value on its own
-- ==========================================================================
-- Paddle's own Customer Portal session API
-- (POST /customers/{customer_id}/portal-sessions, confirmed against
-- developer.paddle.com/build/customers/integrate-customer-portal/ during
-- this task) needs Paddle's own customer id, not this project's user id.
-- This RPC exists so paddle-checkout's "portal" action can look that id up
-- using the caller's OWN forwarded session token -- the exact same
-- "forward the real token, let auth.uid() decide" pattern
-- get_my_billing_snapshot and consume_ai_allowance already use -- rather
-- than paddle-checkout needing a service-role client just to read one
-- column. auth.uid()-only, no arguments, same as every other RPC in this
-- file; the browser itself never calls this directly (nothing in
-- src/api/paddleBilling.ts exposes it) and it is deliberately NOT folded
-- into get_my_billing_snapshot's own response, which is a real UI-facing
-- payload that should not carry a raw provider customer id.
create or replace function public.get_my_paddle_customer_id()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_id text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = 'AK010';
  end if;

  select provider_customer_id into v_customer_id
  from public.billing_subscriptions
  where user_id = v_user_id
  order by
    case when status in ('active', 'trialing', 'past_due') then 0 else 1 end,
    updated_at desc
  limit 1;

  return v_customer_id;
end;
$$;

revoke all on function public.get_my_paddle_customer_id() from public, anon;
grant execute on function public.get_my_paddle_customer_id() to authenticated;

-- ==========================================================================
-- 6. get_my_active_paddle_subscription -- narrow internal helper for the
--    "change plan/interval" flow (CORRECTION 0013)
-- ==========================================================================
-- The independent review of patch 0012 found that routing an upgrade/
-- downgrade through Paddle's Customer Portal assumed a portal capability
-- ("Upgrade and downgrade subscriptions in the customer portal") that is
-- currently Early Access, not something AN.KI should depend on for a
-- normal product flow. The general-availability mechanism is the
-- subscription update API itself -- PATCH /subscriptions/{id} with an
-- `items` array and an explicit `proration_billing_mode` (confirmed
-- against developer.paddle.com/build/subscriptions/replace-products-
-- prices-upgrade-downgrade/ during this correction) -- which needs
-- Paddle's own subscription id, not this project's user id or the Paddle
-- customer id get_my_paddle_customer_id() already exposes.
--
-- Same "forward the caller's own token, let auth.uid() decide" pattern as
-- every other RPC in this file -- paddle-checkout's new "change_subscription"
-- action calls this using the caller's own forwarded session token, never
-- a service-role client, and the browser itself never calls this directly
-- (nothing in src/api/paddleBilling.ts exposes it).
--
-- Deliberately returns only an ACTIVE-ish subscription (status in active/
-- trialing/past_due -- the exact same predicate get_my_billing_snapshot's
-- own manage_subscription_available already uses) -- there is nothing
-- meaningful to "change the plan of" for a lapsed/cancelled subscription,
-- and the caller (paddle-checkout) treats a null result as
-- "no_active_subscription", never as license to fall back to guessing an
-- id from elsewhere.
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
    and status in ('active', 'trialing', 'past_due')
  order by updated_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'subscription_id', v_row.provider_subscription_id,
    'plan', v_row.plan,
    'billing_interval', v_row.billing_interval,
    'status', v_row.status,
    'cancel_at_period_end', v_row.cancel_at_period_end,
    'scheduled_change_action', v_row.scheduled_change_action
  );
end;
$$;

revoke all on function public.get_my_active_paddle_subscription() from public, anon;
grant execute on function public.get_my_active_paddle_subscription() to authenticated;
