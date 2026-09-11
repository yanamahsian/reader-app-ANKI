-- AESTESIS CATALOG BOUNDARY v1
-- Server-owned curated catalog membership for the parallel Aestesis entitlement.
-- This table is intentionally separate from free_catalog_works and from
-- Library/Atlas/Academy full-catalog access.

create table if not exists public.aestesis_catalog_works (
  work_id text primary key references public.works(id),
  enabled boolean not null default true,
  -- Fallback browse/display order only. This is NOT the Aesthesis
  -- CONTINUE/CROSS reading graph and must never be treated as "next book".
  sort_order integer,
  -- Reserved for future independent editorial age metadata. It is nullable
  -- on purpose; contentMaturity is not an age label and is not copied here.
  age_band text,
  created_at timestamptz not null default now()
);

create index if not exists aestesis_catalog_works_enabled_sort_idx
  on public.aestesis_catalog_works(sort_order)
  where enabled;

comment on table public.aestesis_catalog_works is
  'Server-owned Aestesis catalog membership. Aestesis-scoped discovery/content is limited to enabled works in this table; Free and Library/Atlas/Academy remain separate access boundaries.';

alter table public.aestesis_catalog_works enable row level security;
revoke all privileges on table public.aestesis_catalog_works from anon, authenticated;
