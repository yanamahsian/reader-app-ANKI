# omnia-ingest production dependency

Active production function:

- slug: `omnia-ingest`
- version: `16`
- SHA256: `e2d39738123185221ac3ade96d431c37ea2f7c58e4c009013921992376927a04`
- verify_jwt: `false`

The full source of the active ingestion function is now tracked in Git at:

`supabase/functions/omnia-ingest/index.ts`

`anki-multilingual-runner` calls:

```text
/functions/v1/omnia-ingest
?sourceId=gutenberg
&externalId=<candidate.external_id>
&workId=<candidate.work_id>
```

Current relevant behavior:

- `workId` is authoritative for identity after existence is checked; `omnia-ingest` does not create a new Work.
- Gutenberg plaintext selection prefers `text/plain; charset=utf-8`, then another non-README plaintext, avoiding README files that Gutendex may also expose as `text/plain`.
- Gutenberg rights are stored as `public-domain` for jurisdiction `US`.
- Valid short works are no longer rejected solely because the estimated reader page count is below five.
- Exact edition identity remains `<workId>-gutenberg-<externalId>`.
