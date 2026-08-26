-- Reconstructed from live production information_schema / pg_constraint / pg_indexes
-- Project: prknybetxirzbzkvmovw
-- Table: public.multilingual_candidates

create table public.multilingual_candidates (
  id uuid not null default gen_random_uuid(),
  work_id text not null,
  author_id text not null,
  source_id text not null,
  external_id text not null,
  language text not null,
  title text not null,
  translator_name text null,
  work_qid text null,
  status text not null default 'discovered',
  edition_id text null,
  rights_status text null,
  jurisdiction text null,
  provider_metadata jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error text null,
  processing_started_at timestamptz null,
  next_attempt_at timestamptz null,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint multilingual_candidates_pkey primary key (id),
  constraint multilingual_candidates_source_id_external_id_work_id_key
    unique (source_id, external_id, work_id),
  constraint multilingual_candidates_work_id_fkey
    foreign key (work_id) references public.works(id) on update cascade on delete cascade,
  constraint multilingual_candidates_author_id_fkey
    foreign key (author_id) references public.authors(id) on update cascade on delete cascade,
  constraint multilingual_candidates_source_id_fkey
    foreign key (source_id) references public.sources(id),
  constraint multilingual_candidates_edition_id_fkey
    foreign key (edition_id) references public.editions(id) on update cascade on delete set null,
  constraint multilingual_candidates_status_check
    check (status = any(array['discovered','processing','ready','review','failed','skipped']))
);

create index multilingual_candidates_author_idx
  on public.multilingual_candidates(author_id, status);

create index multilingual_candidates_status_idx
  on public.multilingual_candidates(status, next_attempt_at, discovered_at);

create index multilingual_candidates_work_idx
  on public.multilingual_candidates(work_id, language);
