-- PRODUCTION SECURITY HARDENING v1
-- Applied to production as migration: production_security_hardening_v1
-- Purpose: keep internal automation/catalog state and RPCs inaccessible to browser roles,
-- while preserving service-role and cron/server execution.

alter table public.multilingual_automation_control enable row level security;
alter table public.soft_classification_attempts enable row level security;
alter table public.work_external_identifiers enable row level security;

revoke all privileges on table public.multilingual_automation_control from anon, authenticated;
revoke all privileges on table public.soft_classification_attempts from anon, authenticated;
revoke all privileges on table public.work_external_identifiers from anon, authenticated;

revoke execute on function public.dispatch_anki_soft_classifier() from public, anon, authenticated;
revoke execute on function public.dispatch_loc_catalog_sync() from public, anon, authenticated;
revoke execute on function public.get_soft_classifier_candidates(integer) from public, anon, authenticated;
revoke execute on function public.record_soft_classification_attempt(text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.translator_enrichment_tick(integer, integer) from public, anon, authenticated;

grant execute on function public.get_soft_classifier_candidates(integer) to service_role;
grant execute on function public.record_soft_classification_attempt(text, text, boolean, text) to service_role;
grant execute on function public.dispatch_anki_soft_classifier() to service_role;
grant execute on function public.dispatch_loc_catalog_sync() to service_role;
grant execute on function public.translator_enrichment_tick(integer, integer) to service_role;
