# omnia-ingest production dependency

Active production function:

- slug: `omnia-ingest`
- version: `15`
- SHA256: `755ce5e27a4735d90dada4c0330f817576ef25a1ae486d5faea349b273b1cd33`
- verify_jwt: `false`

This file records the exact dependency surface used by `anki-multilingual-runner` so the multilingual pipeline can be maintained in Git without changing `omnia-ingest` itself.

## Request contract

Runner calls:

```text
/functions/v1/omnia-ingest
?sourceId=gutenberg
&externalId=<candidate.external_id>
&workId=<candidate.work_id>
```

`workId` is validated against `works.id`. When present, it is used as the authoritative work identity and the function does not run its legacy title/author matcher.

## Edition creation

The active function fetches Gutendex metadata and Gutenberg plaintext, then creates/upserts:

```text
edition id = <workId>-gutenberg-<externalId>
source_id = gutenberg
external_id = <externalId>
language = gutendexRecord.languages[0] or en
translator_name = Gutendex translator names joined with `; `
ingestion_status = processing
```

The function never creates a new Work automatically.

## Text validation

Active constants:

```text
MIN_REASONABLE_TEXT_LENGTH = 20000
APPROXIMATE_PAGE_SIZE = 6500
```

The hard source sanity check rejects plaintext under 20,000 characters.

After normalization it estimates:

```text
estimatedPageCount = ceil(normalizedText.length / 6500)
```

The legacy production function then fails when:

```text
estimatedPageCount < 5
```

with error prefix:

```text
reader-tested check failed:
```

This check is novel-oriented and is why valid short literary works previously failed.

`anki-multilingual-runner` currently handles that exact failure in `finalizeStoredShortWork()` by verifying that the edition/files/rights were fully stored before promoting the legitimate short work to ready.

## Files and rights

Before reinserting book files on re-ingestion, active `omnia-ingest` deletes `rights_assertions` first and then `book_files` to avoid FK duplication problems.

It writes:

- source plaintext file
- normalized `anki-json` file
- `rights_assertions.status = public-domain`
- `rights_assertions.jurisdiction = US`

On normal success it marks:

- `editions.ingestion_status = ready`
- all `book_files` for the edition = ready
- `ingestion_jobs.status = ready`

## Success response

Relevant response fields:

```json
{
  "ok": true,
  "jobId": "...",
  "workId": "...",
  "editionId": "...",
  "sourceStoragePath": "...",
  "normalizedStoragePath": "...",
  "estimatedPageCount": 0,
  "normalizedTextLength": 0
}
```

## Scope rule for the current multilingual pass

Do not modify or redeploy `omnia-ingest` as part of the current multilingual source-sync task unless a concrete blocker requires it. The current runner-side short-work repair is the production behavior to preserve while improving discover/runner batching, idempotency, retries, and large-author discovery.
