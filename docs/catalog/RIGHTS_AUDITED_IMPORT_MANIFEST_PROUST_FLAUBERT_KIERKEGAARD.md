# Rights-audited import manifest: Proust / Flaubert / Kierkegaard

Status: first production-oriented pass for Germany/EU.

Legal basis: German UrhG §64 / EU Directive 2006/116/EC: ordinary literary copyright runs for life of the author + 70 years. A translation is a separate work, so translator death must be checked separately.

Status vocabulary:
- `IMPORT_NOW`: source item is complete enough for AN.KI ingestion and author/translator term is expired in Germany/EU.
- `SOURCE_READY_NO_IMPORTER`: rights look clear, but current AN.KI source pipeline cannot yet ingest this source directly or the source item needs composition from multiple parts.
- `VERIFY_TRANSLATOR`: source exists, but translator identity/term must be verified before ingestion.
- `BLOCKED`: do not ingest.

## Marcel Proust (1871–1922)

### IMPORT_NOW — Project Gutenberg

| Work | Language | Translator | Translator death | Source | External ID |
|---|---|---|---:|---|---:|
| Du côté de chez Swann | fr | — | — | Project Gutenberg | 2650 |
| Les plaisirs et les jours | fr | — | — | Project Gutenberg | 58698 |
| Pastiches et mélanges | fr | — | — | Project Gutenberg | 64145 |
| La Prisonnière | fr | — | — | Project Gutenberg | 60720 |
| Swann's Way | en | C. K. Scott Moncrieff | 1930 | Project Gutenberg | 7178 |
| Within a Budding Grove | en | C. K. Scott Moncrieff | 1930 | Project Gutenberg | 63532 |
| The Guermantes Way | en | C. K. Scott Moncrieff | 1930 | Project Gutenberg | 73425 |

### SOURCE_READY_NO_IMPORTER / COMBINE_REQUIRED

The complete French `À la recherche du temps perdu` is available on French Wikisource as a seven-volume work. Wikisource marks the Proust source material public domain. This is preferable to treating Gutenberg split parts as separate AN.KI editions.

Gutenberg split items already verified and therefore useful as composition sources:
- `À l’ombre des jeunes filles en fleurs`: 2998, 2999, 3000.
- `Le Côté de Guermantes`: 8946, 12999, 13743.
- `Sodome et Gomorrhe`: 15288, 15075.
- `Albertine disparue`: 64427, 64428.
- `Le Temps retrouvé`: 74090, 74091.

English first translations are also rights-clear in Germany/EU:
- Volumes 1–6: C. K. Scott Moncrieff (d. 1930).
- `Time Regained`: Stephen Hudson / Sydney Schiff (1868–1944), first translation 1931.

Do not substitute later Mayor/Kilmartin/Enright translations.

## Gustave Flaubert (1821–1880)

### IMPORT_NOW — Project Gutenberg

| Work / edition | Language | Translator | Translator death | External ID |
|---|---|---|---:|---:|
| Madame Bovary | fr | — | — | 14155 |
| Madame Bovary | en | Eleanor Marx-Aveling | 1898 | 2413 |
| Frau Bovary | de | Arthur Schurig | 1929 | 15711 |
| Bouvard et Pécuchet | fr | — | — | 14157 |
| Dictionnaire des idées reçues | fr | — | — | 14156 |
| Un cœur simple | fr | — | — | 26812 |
| Trois contes | fr | — | — | 12065 |
| Salammbô / Salambó | es | Ciro Bayo | 1939 | 66285 |
| Salambo: Ein Roman aus Alt-Karthago | de | Arthur Schurig | 1929 | 15995 |
| The Temptation of St. Anthony | en | Lafcadio Hearn | 1904 | 52225 |

### VERIFY_TRANSLATOR

Do not ingest an English Flaubert item merely because Gutenberg marks it public domain in the USA. Items without translator metadata in the Gutenberg record remain `VERIFY_TRANSLATOR` for the Germany/EU catalog until the specific translation is identified.

Examples requiring translator verification before EU release:
- Salammbo, Gutenberg 1290.
- A Simple Soul, Gutenberg 1253.
- Herodias, Gutenberg 1291.
- Over Strand and Field, Gutenberg 14233.
- split English `Sentimental Education` volumes.

## Søren Kierkegaard (1813–1855)

### SOURCE_READY_NO_IMPORTER — Danish originals

Danish Wikisource explicitly marks the following source editions public domain in Denmark and the United States:
- `Enten — Eller. Første Deel` (1878 edition).
- `Enten — Eller. Anden Deel` (1878 edition).
- `Til Selvprøvelse Samtiden anbefalet`.

These should be imported as original-language editions once the AN.KI Wikisource full-book ingestion path is used for curated manual candidates.

### English translations

- C. K. Scott Moncrieff is irrelevant here; do not mix Proust rights data into Kierkegaard.
- David F. Swenson (d. 1940): his translations are term-expired in Germany/EU, but exact source scans/texts must be matched work-by-work before ingestion.
- Lee M. Hollander (d. 1972): `Selections from the Writings of Kierkegaard` is **not** public domain in Germany/EU until 1 Jan 2043. `BLOCKED` for EU distribution today.
- Walter Lowrie (d. 1959): translations remain protected through 2029; public domain from 1 Jan 2030. `BLOCKED` today.

## Emil Cioran

`BLOCKED` by default. Cioran died in 1995. Under the ordinary Germany/EU life+70 rule, his authorial works do not enter the public domain until 1 Jan 2066. Do not import full texts without a separate licence or other valid rights basis.

## Ingestion constraint discovered during this audit

The current `anki-multilingual-runner` is Gutenberg-only and, on success, records `rights_status=public-domain` with `jurisdiction=US`. That is insufficient for a Germany/EU-facing rights decision. Therefore this manifest must be the authoritative allow-list for the curated EU import pass, and the runner should be extended to preserve an audited jurisdiction/rights basis rather than silently converting every successful Gutenberg import into a US-only assertion.

## Primary evidence URLs

- German copyright term: https://www.gesetze-im-internet.de/urhg/__64.html
- EU term directive: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32006L0116
- Proust Gutenberg author catalogue: https://www.gutenberg.org/ebooks/author/987?sort_order=title
- Flaubert Gutenberg author catalogue: https://www.gutenberg.org/ebooks/author/574?sort_order=title
- Proust French Wikisource cycle: https://fr.wikisource.org/wiki/%C3%80_la_recherche_du_temps_perdu
- Proust English Wikisource cycle: https://en.wikisource.org/wiki/Remembrance_of_Things_Past
- Kierkegaard Danish Wikisource: https://da.wikisource.org/wiki/Enten_%E2%80%94_Eller._F%C3%B8rste_Deel
- Kierkegaard Danish Wikisource: https://da.wikisource.org/wiki/Enten_%E2%80%94_Eller._Anden_Deel
- Kierkegaard Danish Wikisource: https://da.wikisource.org/wiki/Til_Selvpr%C3%B8velse_Samtiden_anbefalet
