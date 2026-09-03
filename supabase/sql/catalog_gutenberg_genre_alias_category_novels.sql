-- Observed live during the required 10-work dry-run of the Gutenberg genre
-- Edge Function (2026-09-03): Gutendex's bookshelf label "Category: Novels"
-- appeared twice, on two unrelated works (an English novel and a Portuguese
-- novel), both genuinely novels. This bookshelf name had no existing mapping
-- (catalog_taxonomy_source_aliases only had subject-heading-style aliases,
-- e.g. "detective and mystery stories"), even though the canonical genre
-- 'novel' already exists. This is a literal, single alias for a real,
-- observed label -- not a new parsing rule and not a guess.
--
-- Every other unmatched label seen in the same dry run was deliberately left
-- unmapped: "X -- Fiction" LCSH suffixes (e.g. "Bombings -- Fiction") have no
-- safe target because the canonical taxonomy has no generic "Fiction" term
-- (only specific forms: historical-fiction, crime-fiction, etc.) -- mapping
-- them to "novel" would be a semantic guess (a work tagged "X -- Fiction"
-- could be a short story or novella, not necessarily a novel). Nationality/
-- period/topic labels ("American fiction -- 20th century", "Circle-squaring",
-- "Science -- Miscellanea") and multi-topic bookshelves ("Category: Essays,
-- Letters & Speeches", "Category: Philosophy & Ethics") are not genre
-- signals at all and were correctly left unmatched.
insert into public.catalog_taxonomy_source_aliases (source, category, source_label_normalized, term_id)
values ('gutendex', 'genre', 'category: novels', 'novel')
on conflict (source, category, source_label_normalized) do nothing;
