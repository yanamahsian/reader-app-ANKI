-- SUBSCRIPTION & AI ENTITLEMENTS FOUNDATION v1
-- NOT YET applied to production. Prepared for review; production
-- migration/deploy is a separate, explicit gate (see the delivery report).
--
-- Purpose: this is a server-side cost-control and entitlement foundation --
-- NOT Stripe, NOT checkout, NOT a paid-subscription launch. It answers one
-- question for every costly AI request: USER -> EFFECTIVE PLAN -> AI
-- ALLOWANCE -> ENFORCE -> METER, entirely inside Postgres, so that Stripe /
-- trial / Pass It Forward can later be added as pure entitlement-grant
-- writers without ever touching AI enforcement logic again.
--
-- Canonical product model (docs/ANKI_PRODUCT_ARCHITECTURE.md, frozen,
-- NOT reopened by this migration): Free -> Library -> Atlas -> Academy,
-- paid tiers cumulative. This migration does not rename tiers, does not
-- change prices, and does not invent a 5th tier -- 'free'/'library'/
-- 'atlas'/'academy' below are the exact four canonical plan identifiers.
--
-- ==========================================================================
-- WHY A GRANT TABLE, NOT A users.plan COLUMN
-- ==========================================================================
-- A single mutable "current plan" column cannot express WHY a user has
-- access, WHEN it started, or WHEN/whether it ends -- and this project will
-- eventually need several independent grant sources for the same user:
-- an ordinary paid subscription, a 14-day intent-triggered trial (product
-- architecture section 11), Pass It Forward funded access (section 14),
-- a Founding Membership-derived grant, or a manual support grant. Modelling
-- this as a table of GRANTS (each with its own source, start, optional end,
-- and revocation) means every one of those future mechanisms is just an
-- INSERT into entitlement_grants -- never a rewrite of how "effective plan"
-- or AI enforcement work. Nothing in this migration starts a trial, wires
-- Pass It Forward, or creates a Founding plan value -- see the effective-
-- plan resolver's own comment for exactly what compatibility this leaves in
-- place versus what it deliberately does not implement yet.
--
-- Current production reality (documented here because it is why this
-- migration adds no backfill): auth.users count = 0. No legacy user has an
-- implicit paid plan to preserve. A user with no active grant simply
-- resolves to Free -- this is the ONLY correct behaviour for both "brand
-- new signup" and "every user that exists today", so no synthetic bootstrap
-- data of any kind is needed or created.
--
-- ==========================================================================
-- SECURITY MODEL (all four tables below)
-- ==========================================================================
-- entitlement_grants, ai_plan_limits, ai_usage_monthly, ai_usage_hourly are
-- NEVER read or written directly by anon or authenticated. Row Level
-- Security is enabled on all four with ZERO policies defined -- in
-- Postgres, RLS-enabled-with-no-policies is a default-deny: no row is ever
-- visible or writable to any role that is subject to RLS, regardless of
-- table-level GRANTs. The explicit `revoke all ... from anon, authenticated`
-- statements below are deliberate defense in depth on top of that (the same
-- belt-and-suspenders pattern production_security_hardening_migration.sql
-- already established for internal automation tables) -- even a future
-- accidental `grant select` on one of these tables would still not expose
-- rows, because RLS has no policy that would ever allow it.
--
-- The only way any of this data is ever read or written by the browser is
-- through the two SECURITY DEFINER RPCs at the bottom of this file
-- (consume_ai_allowance, get_my_entitlement_snapshot), both owned by the
-- migration-applying role (the same ownership every other SECURITY DEFINER
-- function in this schema already relies on to transparently bypass RLS --
-- see thought_threads.sql's own functions for the established precedent).
-- Neither RPC accepts a user_id, plan, used, or limit argument from the
-- client; both derive identity exclusively from auth.uid().
--
-- A future Stripe/trial/Pass-It-Forward backend writes entitlement_grants
-- through the service_role key (server-side only, never shipped to the
-- browser or into this Edge Function) -- consistent with how every other
-- privileged write in this schema already works. This migration adds no
-- explicit service_role grant, matching this repository's existing
-- convention of leaving service_role's already-implicit full access
-- untouched rather than re-granting it per table.

-- ==========================================================================
-- 1. ENTITLEMENT GRANTS
-- ==========================================================================

create table public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The four canonical, frozen plan identifiers only -- see
  -- docs/ANKI_PRODUCT_ARCHITECTURE.md section 12. 'free' is included even
  -- though the ABSENCE of any active grant already resolves to Free (see
  -- effective_plan_for_user below): an explicit free-plan grant row is not
  -- created automatically by anything in this migration, but the schema
  -- allows one (e.g. a future explicit downgrade-to-free audit record)
  -- without ever requiring a schema change to add it.
  plan text not null check (plan in ('free', 'library', 'atlas', 'academy')),
  -- Free-text on purpose, not an enum: this is the "why does this grant
  -- exist" audit trail (e.g. 'subscription', 'trial', 'pass_it_forward',
  -- 'founding_membership', 'manual_support_grant', 'promotion'). Pass It
  -- Forward and Founding Membership are source values here, NEVER separate
  -- plan values -- product architecture section 14/16 is explicit that
  -- neither is its own subscription tier.
  source text not null check (btrim(source) <> ''),
  starts_at timestamptz not null default now(),
  -- null = open-ended (e.g. an ordinary active subscription with no known
  -- end date yet). A future 14-day trial grant sets this to starts_at +
  -- interval '14 days' at insert time -- effective_plan_for_user already
  -- honours ends_at correctly, so intent-triggered trials are fully
  -- compatible with this schema without any further change here.
  ends_at timestamptz,
  -- Soft revocation distinct from ends_at: an admin/support action that
  -- ends a grant early leaves a permanent record of *when it was revoked*,
  -- separate from whatever ends_at may have originally said.
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Optional, non-secret provider bookkeeping only (e.g. a Stripe
  -- subscription id, a trial-trigger reason) -- never secrets/API keys.
  metadata jsonb not null default '{}'::jsonb
);

create index entitlement_grants_user_id_idx on public.entitlement_grants(user_id);
-- Covers the resolver's own filter shape (active grants for one user) --
-- starts_at/ends_at are compared in-memory over this already-narrow set
-- rather than indexed separately, since a single user is expected to have
-- at most a handful of grant rows ever.
create index entitlement_grants_active_lookup_idx on public.entitlement_grants(user_id, plan)
  where revoked_at is null;

alter table public.entitlement_grants enable row level security;
revoke all privileges on table public.entitlement_grants from anon, authenticated;

-- ==========================================================================
-- 2. EFFECTIVE PLAN RESOLVER (internal only -- never a browser-facing RPC)
-- ==========================================================================
-- Single source of truth for "what plan does this user actually have right
-- now". Highest-ranked ACTIVE grant wins (academy > atlas > library > free);
-- no active grant at all resolves to 'free'. "Active" means: starts_at has
-- already passed, ends_at is either null or still in the future, and the
-- grant has not been revoked -- all three conditions evaluated against the
-- real current time, never a client-supplied timestamp.
--
-- Deliberately NOT security definer-exposed to authenticated/anon: it takes
-- a p_user_id argument, and a browser-facing RPC that accepted an arbitrary
-- user_id would let any signed-in visitor query anyone's plan. It is called
-- exclusively from inside the two SECURITY DEFINER RPCs below, which always
-- pass auth.uid() -- never a client-supplied id -- as p_user_id. Marked
-- security definer + search_path itself anyway (rather than relying on
-- being invoked from within another definer context) so its own privileges
-- and behaviour do not depend on how or where it happens to be called from.
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

revoke all on function public.effective_plan_for_user(uuid) from public, anon, authenticated;

-- ==========================================================================
-- 3. AI PLAN LIMITS (server-owned configuration, not marketing copy)
-- ==========================================================================
-- One row per (plan, bucket). Bucket is free text, not a fixed enum, so a
-- future 'academy_ai' bucket (once Academy actually ships an AI action) is
-- exactly one INSERT away -- no ALTER TABLE, no redesign, matching the
-- explicit v1 scope: only 'reader_ai' (translate/explain) and 'atlas_ai'
-- (atlas-question/atlas-contradictions/atlas-unfinished-lines) are seeded
-- or used below.
--
-- These numbers are PROVISIONAL OPERATIONAL DEFAULTS for cost control and
-- real enforcement testing -- not a marketing/pricing promise, and
-- deliberately not written into docs/ANKI_PRODUCT_ARCHITECTURE.md, which
-- explicitly leaves exact AI quotas unresolved (section 17, open question
-- 1). Changing them later is one UPDATE against this table, never an Edge
-- Function redeploy.
create table public.ai_plan_limits (
  plan text not null check (plan in ('free', 'library', 'atlas', 'academy')),
  bucket text not null check (btrim(bucket) <> ''),
  monthly_limit integer not null check (monthly_limit >= 0),
  hourly_limit integer not null check (hourly_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan, bucket)
);

alter table public.ai_plan_limits enable row level security;
revoke all privileges on table public.ai_plan_limits from anon, authenticated;

-- Provisional v1 seed. Idempotent (safe to re-run this migration file):
-- a second apply updates the numbers in place rather than erroring or
-- duplicating rows.
insert into public.ai_plan_limits (plan, bucket, monthly_limit, hourly_limit) values
  ('free',    'reader_ai', 20,   5),
  ('free',    'atlas_ai',  3,    1),
  ('library', 'reader_ai', 250,  25),
  ('library', 'atlas_ai',  3,    1),
  ('atlas',   'reader_ai', 600,  60),
  ('atlas',   'atlas_ai',  120,  20),
  ('academy', 'reader_ai', 1200, 100),
  ('academy', 'atlas_ai',  240,  40)
on conflict (plan, bucket) do update
  set monthly_limit = excluded.monthly_limit,
      hourly_limit = excluded.hourly_limit,
      updated_at = now();

-- ==========================================================================
-- 4. USAGE METERING (bounded aggregates -- not an endless per-call event log)
-- ==========================================================================
-- One row per (user, period, bucket) for each of the two rolling windows
-- this v1 enforces, UTC-bounded regardless of the session's own timezone
-- setting (date_trunc(..., now() at time zone 'utc') at time zone 'utc' is
-- the standard idiom for a timezone-independent UTC period boundary as a
-- real timestamptz). A single successful consume_ai_allowance call touches
-- at most one row in each table -- never an unbounded, ever-growing event
-- table for something this v1 only ever needs as a running count.
create table public.ai_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  bucket text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start, bucket)
);

create table public.ai_usage_hourly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  bucket text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start, bucket)
);

-- The primary keys above already provide the exact covering index this v1
-- ever queries by (user_id, period_start, bucket exactly, or user_id as a
-- leftmost prefix) -- no separate index is added.

alter table public.ai_usage_monthly enable row level security;
alter table public.ai_usage_hourly enable row level security;
revoke all privileges on table public.ai_usage_monthly from anon, authenticated;
revoke all privileges on table public.ai_usage_hourly from anon, authenticated;

-- ==========================================================================
-- 5. ATOMIC CONSUME RPC -- the one canonical enforcement primitive
-- ==========================================================================
-- Called by the Edge Function (omnia-ai) with the caller's own forwarded
-- Supabase session JWT, immediately before -- never instead of, and never
-- long before -- an actual OpenAI request is dispatched. See
-- supabase/functions/omnia-ai/index.ts's own consumeAiAllowance() helper
-- and each action handler's call site for exactly where in each flow this
-- fires (deterministic no_memory/insufficient_material short-circuits in
-- the three Atlas actions never reach this call at all).
--
-- Identity is auth.uid() ONLY -- p_action is the single argument; there is
-- no user_id, plan, used, or limit parameter anywhere in this signature,
-- so none of those can ever be supplied or spoofed by the client. Plan
-- resolution and limit values are both looked up server-side from
-- effective_plan_for_user() and ai_plan_limits respectively -- nothing
-- about "what plan am I" or "what is my limit" is ever trusted from the
-- caller.
--
-- Concurrency safety: within this ONE transaction (a single RPC call is a
-- single implicit transaction), each usage row is first guaranteed to
-- exist via INSERT ... ON CONFLICT DO NOTHING, then locked with SELECT ...
-- FOR UPDATE, always in the same order (monthly row, then hourly row) on
-- every call, so no lock-ordering deadlock is possible between two
-- concurrent calls for the same user+bucket. Two concurrent requests for
-- the last remaining unit cannot both pass: whichever transaction commits
-- first (having already incremented `used`) is what the second
-- transaction's own FOR UPDATE necessarily blocks on and then reads,
-- because both target the exact same (user_id, period_start, bucket) row.
--
-- This function NEVER raises for any of the ordinary "not allowed" cases
-- (unmapped action, missing plan-limit config row, monthly limit reached,
-- hourly limit reached) -- it always returns a 200-level jsonb result with
-- allowed/reason, which is simpler and more robust for the Edge Function to
-- classify than parsing exception text or SQLSTATEs for four different
-- "denied" reasons. It DOES raise (a distinct, stable SQLSTATE, matching
-- this schema's existing AK00x convention) for the one case that should be
-- structurally unreachable given this function is granted to `authenticated`
-- only: auth.uid() somehow still resolving to null.
--
-- v1 counts exactly 1 usage unit per REAL OpenAI request dispatched -- no
-- token-weighting. See the Edge Function's own header comment for why: this
-- project has no real unit-economics telemetry yet, and a fake-precision
-- weighting scheme would be worse than an honest, simple call count. A
-- provider failure AFTER a unit was consumed here is NOT refunded -- the
-- unit was already spent the moment this call returned allowed:true, and by
-- then the underlying OpenAI request may already have incurred real,
-- variable cost regardless of how it ultimately resolves. This is a
-- deliberate v1 simplification, not an oversight; a reservation/refund
-- ledger can be added later if real telemetry shows it is actually needed.
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
    -- Structurally unreachable in normal operation: this function is
    -- granted to `authenticated` only (see the revoke/grant pair below),
    -- so a request that reaches this line at all already carries a JWT
    -- PostgREST itself accepted. Kept as an explicit, typed defensive
    -- guard anyway, consistent with every other SECURITY DEFINER function
    -- in this schema.
    raise exception 'Authentication required' using errcode = 'AK010';
  end if;

  -- ACTION -> BUCKET MAPPING lives here, server-side, in the same place
  -- plan/limit truth already lives -- never duplicated as parallel logic
  -- in the Edge Function TypeScript layer.
  v_bucket := case p_action
    when 'translate' then 'reader_ai'
    when 'explain' then 'reader_ai'
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

  -- Missing config row -> fail closed (deny), never fail open into
  -- unlimited or crash the caller with an opaque 500. This is the guard
  -- that makes forgetting to seed a (plan, bucket) row safe rather than a
  -- silent cost leak.
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

  -- Lock order is fixed (monthly row, then hourly row) on every call --
  -- see this function's own header comment on why that rules out deadlock
  -- between two concurrent calls for the same user+bucket.
  select used into v_monthly_used
  from public.ai_usage_monthly
  where user_id = v_user_id and period_start = v_month_start and bucket = v_bucket
  for update;

  select used into v_hourly_used
  from public.ai_usage_hourly
  where user_id = v_user_id and period_start = v_hour_start and bucket = v_bucket
  for update;

  -- Both windows are verified BEFORE either is incremented -- an allowed
  -- request always advances both counters together, an allowed:false
  -- result never advances either.
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
$$;

revoke all on function public.consume_ai_allowance(text) from public, anon;
grant execute on function public.consume_ai_allowance(text) to authenticated;

-- ==========================================================================
-- 6. READ-ONLY ENTITLEMENT SNAPSHOT RPC (for Subscription/Account UI)
-- ==========================================================================
-- auth.uid() only, no arguments -- there is no way to ask this RPC for
-- anyone else's snapshot. Returns the qualitative AI tier name product
-- architecture section 13 already defines (Free -> "AI Preview", Library ->
-- "AI Standard", Atlas -> "AI Extended", Academy -> "AI Advanced") plus
-- real monthly usage/limit/reset for the two v1 buckets -- never raw
-- entitlement_grants rows, provider ids, or other metadata.
create or replace function public.get_my_entitlement_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text;
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

  v_plan := public.effective_plan_for_user(v_user_id);

  v_ai_tier_name := case v_plan
    when 'academy' then 'AI Advanced'
    when 'atlas' then 'AI Extended'
    when 'library' then 'AI Standard'
    else 'AI Preview'
  end;

  v_month_start := date_trunc('month', now() at time zone 'utc') at time zone 'utc';

  select monthly_limit into v_reader_limit
  from public.ai_plan_limits where plan = v_plan and bucket = 'reader_ai';

  select monthly_limit into v_atlas_limit
  from public.ai_plan_limits where plan = v_plan and bucket = 'atlas_ai';

  select used into v_reader_used
  from public.ai_usage_monthly
  where user_id = v_user_id and period_start = v_month_start and bucket = 'reader_ai';

  select used into v_atlas_used
  from public.ai_usage_monthly
  where user_id = v_user_id and period_start = v_month_start and bucket = 'atlas_ai';

  return jsonb_build_object(
    'effective_plan', v_plan,
    'ai_tier_name', v_ai_tier_name,
    'reader_ai', jsonb_build_object(
      'used', coalesce(v_reader_used, 0),
      'monthly_limit', v_reader_limit,
      'reset_at', v_month_start + interval '1 month'
    ),
    'atlas_ai', jsonb_build_object(
      'used', coalesce(v_atlas_used, 0),
      'monthly_limit', v_atlas_limit,
      'reset_at', v_month_start + interval '1 month'
    )
  );
end;
$$;

revoke all on function public.get_my_entitlement_snapshot() from public, anon;
grant execute on function public.get_my_entitlement_snapshot() to authenticated;
