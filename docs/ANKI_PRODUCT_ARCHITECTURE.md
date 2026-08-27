# AN.KI Product Architecture

**Status:** Canonical. This document is the source of truth for what AN.KI is, how its product layers connect, and what each subscription tier includes. It is a product constitution, not a specification and not a brainstorm. Decisions marked frozen are not to be reopened without founder approval.

**Product name:** AN.KI (also written Anki). The product must never be referred to as Foliolith, Omnia, or any other prior working name, in this document or elsewhere.

---

## 1. Product identity

**Canonical category:** Intellectual reading platform.

AN.KI is not an Amazon Kindle clone, not an ebook store competing on catalog size, not Goodreads, not a generic EPUB/PDF reader, not ChatGPT with a book attached, not a gamified reading tracker, not a collection of unrelated AI buttons, and not an educational platform disconnected from actual reading.

**Core proposition:** reading inside AN.KI gradually becomes a personal structure of knowledge. The long-term value of AN.KI increases with use. A user who has used AN.KI for two years should possess something inside the product that did not exist on day one: a structured memory of what they read, noticed, connected, questioned, and learned.

Retention comes primarily from accumulated intellectual value, not from artificial addiction mechanics.

> **Canonical retention principle:** Do not return because you will lose a streak. Return because your thought continues to exist here.

AN.KI should know not only *what* the user has read, but *what they noticed and understood*. The product should feel increasingly personal as reading accumulates.

---

## 2. The core system

AN.KI is one connected progression, not four unrelated products:

**LIBRARY → READER → ATLAS → ACADEMY**

| Stage | Question it answers | What it creates |
|---|---|---|
| Library | "What should I read?" | Access |
| Reader | "Read." | Reading activity and intellectual signals |
| Atlas | "How does everything I have read connect?" | Memory and connections |
| Academy | "Turn those connections into structured knowledge." | Structured education |

This progression is simultaneously the product architecture, the user-value progression, and the premium-value progression.

---

## 3. Fixed product surfaces

- **Home** — editorial museum/showcase. Not a catalog dump, not an ecommerce homepage.
- **Library** — visual book fund; the actual corpus of books available inside AN.KI.
- **Search** — a compact tool, not a giant separate product surface.
- **Book Detail** — a premium object page with one clear primary action: Read.
- **Author** — an intellectual portrait of a person plus their Works. Not a social profile.
- **Collection** — a curated small exhibition.
- **Reader** — a dedicated silent reading environment; the catalog shell disappears; no decorative photographic background inside actual reading.
- **Atlas** — persistent personal intellectual memory and knowledge system.
- **Academy** — structured learning built on Library + Reader + Atlas.

---

## 4. Reader — canonical role

Reader is not the long-term retention product by itself. Reader is where intellectual data is created.

Baseline Reader should eventually support: high-quality typography, reading settings, reading progress, bookmarks, highlights, notes, in-book search, real edition selection, real language selection, personal EPUB/PDF/FB2 import where technically and legally supported, Translate, Explain, contextual dictionary/help, synchronization, and spoiler-aware contextual assistance where relevant.

AI must remain contextual and quiet. Reader must not become a generic permanent chat window — the central experience remains reading.

---

## 5. Reveal

Reveal is an intelligent contextual capability inside Reader. It examines a selected passage using the current book, the exact reading position, previously encountered characters, historical context, literary references and allusions, terminology, relevant concepts, and information already revealed to the reader. Reveal determines the missing layer required to understand the selected passage — for example, who a referenced historical person is, what event is being referenced, why a phrase matters, what an archaic word means in context, whether the reader has met a character before, what philosophical concept is in play, or what a contemporary reader of the original would have understood.

Reveal avoids unnecessary encyclopedia-style dumping and is spoiler-safe where relevant.

Reveal is an important Reader capability but is **not** the main long-term retention mechanism — Atlas is.

---

## 6. Intellectual signals created during reading

Reader activity produces signals that later feed Atlas: books opened, completed, and abandoned; reading progress; highlights; notes; bookmarks; questions; repeated concepts; recurring themes; people, places, and historical events; philosophical ideas; literary movements; works of art; authors; passages repeatedly revisited; connections explicitly saved by the user; and relationships inferred with sufficient confidence.

AN.KI does not treat finished books as dead objects. Reading produces a persistent intellectual history.

---

## 7. Atlas — the central differentiator

Atlas is **not** a decorative network visualization, a recommendation page, a collection of related books, generic AI summaries, or a pretty "knowledge map."

> **Canonical definition:** Atlas = persistent memory of the user's intellectual life inside AN.KI.

Every book continues to exist after the user finishes reading it. Over time Atlas learns relationships among books, authors, passages, highlights, personal notes, ideas, philosophical concepts, historical events, artistic and literary movements, people, places, themes, contradictions, questions, and reading paths.

**Example:** a user reads Dostoevsky → Nietzsche → Kafka → Tolstoy → Zola. Over time Atlas may detect recurring interest in guilt, freedom, power, social norm, alienation, and morality. The user should eventually be able to ask "Show me how the idea of freedom changed across everything I read this year," and the answer draws primarily on the user's own corpus — exact books, passages, highlights, notes, remembered questions, relationships, contradictions, and relevant next reading. This is fundamentally different from asking a generic chatbot "What is freedom in literature?"

Atlas becomes more valuable as the user reads more. This compounding value is AN.KI's primary retention engine.

### Atlas — core experiences

- **Personal knowledge graph** — books, authors, ideas, events, and user-created material connected through meaningful semantic relationships. Functional first, visual second.
- **Cross-book questions** — the user queries their own accumulated reading corpus.
- **Thematic threads** — e.g., freedom across Dostoevsky, Nietzsche, Kafka, and Camus.
- **Contradictions** — meaningful disagreement between authors, books, philosophical positions, interpretations, or historical perspectives.
- **Personal passage memory** — recovering relevant passages, highlights, and notes from months or years ago.
- **Reading trails** — how one book, idea, or question led intellectually to another.
- **Intelligent next reading** — recommendations emerging from existing interests, missing context, unresolved themes, intellectual gaps, adjacent traditions, and opposing positions — never reduced to "people who liked X also liked Y."
- **Unfinished lines of thought** — AN.KI may surface questions, themes, or connections the user previously explored but did not continue (e.g., "Six months ago you saved three passages about guilt in Dostoevsky. Your recent reading of Kafka creates a new connection."). This creates a natural return reason without cheap engagement mechanics.
- **Longitudinal intellectual history** — how the user's reading interests and intellectual themes changed over months and years.

---

## 8. Return / retention architecture

Frozen primary return behaviours: continuing a current book; continuing an intellectual thread; seeing new connections created by recent reading; recovering previous thoughts and passages; exploring a question across accumulated reading; following a newly discovered reading path; continuing an Academy programme; seeing how the personal Atlas changed over time; revisiting unfinished questions; and discovering meaningful new material connected to previous reading.

Streaks are not the primary retention mechanism. Reading streaks, statistics, goals, or annual summaries may exist as secondary utilities only.

> **Canonical principle:** retention through accumulated intellectual value, not retention through anxiety.

| User action | Accumulated value | Reason to return |
|---|---|---|
| Reads a book | A passage, highlight, or note is recorded | Continue the current book |
| Finishes a book | The book joins the persistent corpus, never goes dead | See how it connects to what came before |
| Highlights/annotates | A signal is added to Atlas | Recover the thought later, in a new context |
| Reads across authors/eras | Atlas detects recurring themes | Explore a question across the whole corpus |
| Leaves a thread unresolved | Atlas remembers the open question | Unfinished thought resurfaces against new reading |
| Completes part of a discipline | Academy tracks coverage and gaps | Continue a structured programme from where it left off |

---

## 9. Academy — canonical role

Academy is not merely a catalog of prerecorded courses, a set of generic AI lessons, or a separate online-course platform bolted onto AN.KI.

> **Canonical definition:** Academy = AN.KI turns reading into structured education.

Academy sits on top of Library + Reader + Atlas. It may support structured programmes such as History of Architecture, Art History, Philosophy, Literature, Literary Theory, Ancient Greece, Classical Studies, History, Political Thought, History of Cinema, History of Science, and other serious intellectual disciplines. Its distinctive capability is personalization through Atlas.

**Example:** a user has independently read Vitruvius, Renaissance architecture, Palladio, Modernism, and Le Corbusier. AN.KI may determine the user has already encountered part of the conceptual foundation for a History of Western Architecture programme, and adapt a structured path (Antiquity → Romanesque → Gothic → Renaissance → Baroque → Neoclassicism → Modernism → Contemporary), distinguishing already read, partially covered, missing, prerequisite, recommended primary source, recommended secondary source, relevant artwork/building, historical context, important concept, and knowledge gap.

Academy converts personal reading history into deliberate study. It does not merely tell the user "here are ten courses you might like."

Academy may eventually include structured learning paths, curated syllabi, primary and secondary reading, historical context, conceptual explanations, comprehension questions, comparison exercises, reading assignments, intellectual synthesis, adaptive sequencing based on Atlas, prerequisite and gap detection, and progress tracking across a discipline. It avoids fake university aesthetics, meaningless certificates, badge inflation, and XP as a primary educational mechanic. Depth and structure matter more than gamification.

---

## 10. Free — permanent access

Free is a permanent product tier, not merely a temporary trial.

> **Canonical principle:** the user must be able to fall in love with AN.KI before paying.

Free includes: €0 access; baseline Reader; reading progress; bookmarks; basic highlights; basic notes; reading personal books where supported; a deliberately limited AN.KI library; several AI actions sufficient to experience Translate / Explain / Reveal; limited recommendations and discovery; a limited preview of Atlas; and account and synchronization where technically appropriate.

The permanent free-book corpus targets approximately 50–100 carefully selected public-domain works, chosen deliberately rather than left as random leftover content, so the Free library communicates AN.KI's quality and intellectual identity. Potential authors include, subject to real edition/rights availability: Dostoevsky, Tolstoy, Austen, Kafka, Goethe, Shakespeare, Nietzsche, Cervantes, Dante, and other canonical authors. Works with uncertain rights are not used merely to fill the Free catalog.

Free must remain genuinely useful and is never degraded into an unusable demo. (See §25 for the current implementation status of catalog integrity underpinning this promise.)

---

## 11. Premium trial

AN.KI may use a premium trial in addition to permanent Free. The trial must **not** automatically start at registration, because reading is slow: a user may register, read slowly, and only understand AN.KI's premium value after a registration-anchored trial period would already have expired.

> **Frozen architecture:** the trial begins when the user intentionally attempts to access a premium capability — most naturally, the first meaningful Atlas premium interaction (e.g., the user sees that new Atlas connections exist and chooses "Unlock your Atlas").

Target premium trial duration: approximately 14 days. Trial is complementary to Free, not a replacement for it.

Whether the trial exposes Atlas only, or the complete paid product experience, is an **open question** (see §17).

---

## 12. Subscription family (frozen)

Tier names and pricing below are frozen. They are not to be renamed, recalculated, or benchmarked against competitors within this document or in any derivative work.

**Canonical hierarchy:** Free → Library → Atlas → Academy. Paid tiers are cumulative: Atlas includes Library; Academy includes Atlas + Library.

Atlas is the primary paid plan and is marked **Recommended**.

### Table 2 — Approved launch pricing

| Tier | Monthly | Annual | Effective monthly (annual) | Annual savings vs. 12× monthly |
|---|---|---|---|---|
| Free | €0 | — | — | — |
| Library | €14.90 | €129 | ≈€10.75 | €49.80 (≈27%) |
| Atlas — **Recommended** | €24.90 | €219 | ≈€18.25 | €79.80 (≈27%) |
| Academy | €39.90 | €349 | ≈€29.08 | €129.80 (≈27%) |
| Founding Membership | €799 one-time | — | — | Lifetime access |

These are launch prices. They are not a promise that AN.KI will never change pricing later, and this document does not authorize a future change — that requires a separate, explicit decision.

### 12.1 Library subscription

**€14.90/month, €129/year.** Library is not a cheap entry subscription — it is the full premium reading platform, and does not include Atlas's persistent cross-book intellectual system, so the user understands why Atlas costs more.

Library includes approximately: the full AN.KI reading catalog available for the user's jurisdiction and all qualifying editions/translations; full Reader; personal library; reading progress; bookmarks; highlights; notes; synchronization; personal document import where supported; collections; strong catalog search; intellectual filters; richer discovery and recommendations; Translate; Explain; Ask Book / book-context AI where product architecture supports it; and a sustainable Library-level AI allowance.

### 12.2 Atlas subscription

**€24.90/month, €219/year. Recommended.** Atlas is expected to become the main paid subscription for the majority of serious AN.KI users.

Atlas includes everything in Library, plus: the persistent personal intellectual graph; relationships among books, authors, ideas, eras, and movements; semantic relationships across reading; personal recurring themes; cross-book questions and semantic search; cross-book passage recall; comparisons between books and authors; contradictions between authors/ideas; reading trails; unfinished intellectual threads; longitudinal intellectual history; intelligent next-reading paths; deeper recommendations, Ask Book, and contextual analysis; character maps and intellectual/context maps where appropriate; and a higher sustainable AI allowance.

Atlas's defining value is not "more AI requests" — it is that AN.KI remembers and structures the user's intellectual reading life.

### 12.3 Academy subscription

**€39.90/month, €349/year.** Academy includes everything in Library + Atlas, plus full Academy capabilities: structured intellectual programmes; university-style learning paths and curated syllabi; sequencing; prerequisite and knowledge-gap detection; integration of the personal Atlas into study; primary and secondary sources; conceptual and historical context; progress tracking across disciplines; comprehension/synthesis tools; adaptive study pathways; and the highest sustainable AI allowance.

Academy must feel like a qualitative product shift, not "Atlas plus a few articles." At this level AN.KI competes as a personal educational environment, not merely as an ebook reader.

---

## 13. AI economics

AN.KI does not promise mathematically unlimited AI at any tier. AI produces variable operating cost, and all tiers carry sustainable AI allowances.

Exact numerical quotas are **not** frozen (see open questions, §17) and must later be derived from real unit economics: selected AI model, average request size, Translate/Explain/Reveal/Ask Book volume, Atlas computation, cross-book analysis, Academy tutoring/computation, unusually heavy users, caching opportunities, and model-routing opportunities.

Token counts are not exposed as a user-facing concept. Possible user-facing usage category names: Free = *AI Preview*, Library = *AI Standard*, Atlas = *AI Extended*, Academy = *AI Advanced*. These are product concepts, not fixed numerical quotas. A visible usage meter is acceptable. Fair-use limits and abuse/cost controls are expected — one extremely heavy reader must not create unlimited variable cost under a fixed subscription.

---

## 14. Pass It Forward

Pass It Forward is an approved access mechanism, separate from the subscription tiers — **not** another tier.

> **Canonical concept:** a person can fund AN.KI access for somebody else.

Direct access purchases: 1 month Library (€14.90), 1 year Library (€129), 1 month Atlas (€24.90), 1 year Atlas (€219).

Partial contributions are also supported: €5, €10, €25, €50, or a custom amount. A partial contribution does not need to equal one subscription; partial contributions may accumulate in a shared Access Fund that later finances access.

Pass It Forward lets AN.KI remain a premium product while creating a mechanism for wider access. Normal subscription pricing is not reduced to solve accessibility — that is Pass It Forward's job, not a pricing job. Pass It Forward contributions are not mixed with ordinary subscriber entitlements.

---

## 15. Support AN.KI

Support is separate from subscription and from Pass It Forward.

Suggested amounts: €5, €10, €25, €50, €100, or a custom amount. Frequency options: one-time, monthly, yearly.

A user may support AN.KI regardless of product tier. A Free user may support AN.KI; a Library, Atlas, or Academy user may support AN.KI.

Supporting AN.KI does **not** grant extra product functionality.

> **Canonical copy principle:** Supporting AN.KI does not purchase additional features. It funds its development and access for future readers.

Support must not secretly become a higher subscription tier.

---

## 16. Founding Membership

**Canonical price: €799 one-time.** Founding Membership is not a permanent ordinary pricing tier. It is a limited early-stage offer whose purpose is early project financing, reward for the earliest serious supporters, non-equity financing, and long-term user commitment.

Founding Membership includes lifetime access to Library, Atlas, Academy, and core future AN.KI product capabilities. AI remains subject to fair use because it creates permanent variable infrastructure cost. AN.KI does not promise mathematically unlimited lifetime AI.

The exact quantity of Founding Memberships is **not frozen**. A range of approximately 500–1000 memberships has been discussed; the exact cap requires founder approval and remains an open question. The €799 price is frozen.

Founding Membership is rare and launch-specific; lifetime access does not remain permanently available forever.

---

## 17. Genuinely unresolved questions

Only the following questions remain open at this stage:

1. Exact numerical AI quotas per tier.
2. Exact Founding Membership cap (500–1000 range discussed; not decided).
3. Exact composition of the permanent Free book collection.
4. Whether the intent-triggered 14-day trial unlocks Atlas only or the full premium stack.

Additional open questions must not be manufactured merely to avoid making product decisions. Decisions explicitly frozen in this document require founder approval to reopen.

---

## 18. Entitlement matrix

The qualitative access model below is canonical. Numerical AI allowances remain intentionally unspecified pending unit-economics measurement.

| Feature | Free | Library | Atlas — **Recommended** | Academy | Founding |
|---|---|---|---|---|---|
| AN.KI catalog | Deliberately limited Free corpus | Full qualifying catalog for jurisdiction | Library access | Library access | Library access, lifetime |
| Personal book import | Supported baseline where technically/legal | Full supported import | Yes | Yes | Yes |
| Reader | Baseline | Full | Full | Full | Full |
| Reading progress | Yes | Yes | Yes | Yes | Yes |
| Bookmarks | Yes | Yes | Yes | Yes | Yes |
| Highlights | Basic | Full | Full | Full | Full |
| Notes | Basic | Full | Full | Full | Full |
| Sync | Where technically appropriate | Full | Full | Full | Full |
| Translate | AI Preview / limited | AI Standard | AI Extended | AI Advanced | Academy-level, fair use |
| Explain | AI Preview / limited | AI Standard | AI Extended | AI Advanced | Academy-level, fair use |
| Reveal | AI Preview / limited | Standard contextual Reveal | Extended/deeper contextual use | Advanced + educational context | Academy-level, fair use |
| Ask Book | Preview if offered | Book-context Ask | Deeper Ask Book | Advanced / educational use | Academy-level, fair use |
| Recommendations | Limited discovery | Rich reading recommendations | Intellectual-path recommendations | Atlas + study-path recommendations | Full |
| Collections | Limited/basic where appropriate | Full | Full | Full | Full |
| Personal library | Basic | Full | Full | Full | Full |
| Atlas preview | Limited | Limited/no persistent cross-book intelligence | Full | Full | Full |
| Personal knowledge graph | No / preview only | No | Full | Full | Full |
| Cross-book questions | No / preview only | No persistent cross-book layer | Full | Full | Full |
| Cross-book semantic search | No | No | Full | Full | Full |
| Thematic threads | Preview at most | No persistent system | Full | Full | Full |
| Contradictions | No | No | Full | Full | Full |
| Reading trails | Preview at most | No persistent system | Full | Full | Full |
| Intellectual history | No / preview | No | Full | Full | Full |
| Unfinished-thought resurfacing | Preview at most | No | Full | Full | Full |
| Character / context maps | Limited book-local where available | Book-local | Full + cross-book context where relevant | Full + educational integration | Full |
| Academy programmes | No / preview only | No | Preview only if product chooses | Full | Full, lifetime |
| Curated syllabi | No | No | Preview at most | Full | Full |
| Atlas-aware syllabus adaptation | No | No | No | Full | Full |
| Prerequisite / gap detection | No | No | No | Full | Full |
| Educational progress | No | No | No / preview | Full | Full |
| AI tier | AI Preview | AI Standard | AI Extended | AI Advanced | Academy-level, fair use |

**Not tiers:** Pass It Forward is an access-funding mechanism. Support AN.KI is a support/donation mechanism. Neither grants a separate entitlement stack.

---

## 19. Downgrade and user ownership

Retention comes from value, never from data-hostage mechanics.

When a subscription ends, highlights, notes, bookmarks, reading history, and user-uploaded personal metadata are not intentionally destroyed. Atlas history and accumulated intellectual relationships are not intentionally erased.

Premium computation and views may become limited, read-only, partially hidden behind entitlement, or unavailable for new computation — but the underlying user history remains recoverable. Resubscribing restores paid capabilities.

A downgrade must never feel like AN.KI is threatening to destroy years of intellectual life. AN.KI should ultimately support a trustworthy user-data/export policy.

---

## 20. Personal Atlas as a long-term asset

Atlas is deliberately compounding:

- **At registration:** Atlas knows almost nothing.
- **After ~5 books:** first themes and connections can appear.
- **After ~50 books:** the user's intellectual patterns become meaningful.
- **After ~500 books:** Atlas can become a substantial personal intellectual archive.

This compounding value is a core strategic moat. The user should increasingly feel: **"My intellectual history lives here."** AN.KI must not exploit that value through artificial lock-in or data destruction.

---

## 21. The “magic” principle

AN.KI may feel unusual, intelligent, surprising, or even "magical," but the magic comes from intelligence, context, memory, meaningful serendipity, connections, discovery, and knowledge revealing itself progressively.

It does **not** mean literal Hogwarts imitation, floating candles, fantasy decoration, excessive visual effects, childish animation, or fake mystical UX.

> **Canonical internal principle:** The user does not merely search for knowledge in the library. The library gradually reveals knowledge to the user.

Valid examples: a surprising connection appears after reading; an old note becomes relevant to a new book; Atlas discovers an intellectual path; an unresolved question resurfaces months later; Academy recognizes that previous reading already covers part of a discipline; Reveal exposes exactly the missing context for a difficult passage.

**Magic = intelligent relevance.**

---

## 22. Recommendation philosophy

Recommendations do not primarily optimize popularity, virality, engagement, bestseller status, or social trends. They prioritize intellectual relevance, existing reading, unresolved questions, missing context, adjacent schools of thought, opposing positions, historical continuity, and meaningful thematic connections.

AN.KI may deliberately recommend a book a user is unlikely to "like" if it is intellectually important to their current path. Recommendations do not become an infinite feed.

---

## 23. Social features

Social functionality is not part of AN.KI's central identity. AN.KI is not designed around followers, likes, popularity, creator economy, public reading performance, or social status.

If future social capabilities ever exist, they remain subordinate to intellectual reading and require explicit founder approval before entering the core architecture.

---

## 24. Gamification

Gamification is secondary at most. Reading goals, statistics, yearly reading overviews, progress, and completion summaries may exist as utilities.

XP, coins, levels, badge collecting, streak punishment, and "come back today or lose progress" are not core. AN.KI does not use anxiety as the primary return mechanism.

---

## 25. Non-goals

AN.KI must not drift toward:

- TikTok-style engagement or infinite feeds;
- follower economy or social popularity contests;
- streak anxiety;
- XP/coins/badges as a core product;
- generic AI chat everywhere;
- dozens of unrelated AI gimmicks;
- Hogwarts decoration for decoration's sake;
- excessive animation;
- recommendation spam;
- a giant ecommerce-looking catalog;
- replacing serious reading with summaries;
- competing with Kindle purely on catalog size;
- becoming Goodreads;
- becoming a generic educational marketplace;
- becoming an AI chatbot with ebooks attached.

---

## 26. Competitive position

AN.KI does not need to beat Kindle at being Kindle.

Infrastructure giants include Kindle, Kobo, Apple Books, and Google Play Books. Differentiated reading products include systems such as Readwise Reader, Fable, StoryGraph, Bookmate, and similar reading/knowledge products.

AN.KI's target distinction is that its accumulated product is not merely "books purchased" or "highlights stored," but **a persistent model of the user's intellectual reading life**.

**Target category:** intellectual reading platform — a differentiated premium reading product rather than an interchangeable reader.

---

## 27. Product priority

Not everything is MVP. The intended build sequence is:

| Priority | Product work |
|---|---|
| **CORE** | Catalog integrity; excellent Library; excellent Reader; progress/bookmarks/highlights/notes; edition/language integrity; contextual AI reading assistance; first persistent Atlas memory |
| **NEXT** | Cross-book Atlas intelligence; thematic threads; personal passage recall; reading trails; contradictions; better intellectual recommendations; mature long-term Atlas |
| **LATER** | Academy foundation; full Academy programmes; deep adaptive education; secondary statistics; secondary aesthetic/intellectual discovery features; social or gamified additions only if later explicitly justified |

Academy must not delay a strong **Library + Reader + Atlas** foundation.

---

## 28. Product relationship to subscriptions

The subscriptions are not arbitrary feature bundles. They represent stages of the product:

| Tier | Product meaning |
|---|---|
| **Free** | Experience AN.KI. |
| **Library** | Make AN.KI your reading environment. |
| **Atlas — Recommended** | Make AN.KI your persistent intellectual memory. |
| **Academy** | Turn that intellectual memory into structured education. |
| **Founding** | Lifetime access to the long-term AN.KI system, subject to fair-use AI. |

This progression should be visible in product messaging. Tiers must never be marketed primarily as "more AI requests."

---

## 29. Product language / positioning principle

AN.KI is premium and intellectually serious. Avoid cheap SaaS language where possible.

Do not describe Atlas merely as "AI-powered recommendations" or Academy merely as "AI courses." Prefer concepts such as intellectual memory, connections across reading, personal knowledge structure, reading paths, structured study, and accumulated intellectual history.

Avoid inflated claims of intelligence the product cannot technically support yet. The constitution may define the target product without pretending every target capability already exists today.

---

## 30. Product constitution vs. current implementation

This document distinguishes two things:

### A. Product constitution

What AN.KI is intended to become and the rules governing the product. A canonical product feature is not removed merely because it has not been implemented yet.

### B. Current implementation

What exists today. An unimplemented target feature must not be presented to users as already operational.

Where useful, delivery work should label capabilities **Current**, **Planned**, or **Later**. The constitution defines direction; it does not falsify technical status.

As a concrete current example, catalog/edition integrity work remains prerequisite infrastructure: the product promise that language choices and free-corpus availability correspond to real readable editions depends on the ingestion and rights pipeline actually satisfying that promise. That implementation status is tracked separately from this constitution.

---

## 31. Protected decisions

The following decisions are frozen and require explicit founder approval to reopen:

- Product name AN.KI.
- Intellectual reading platform positioning.
- Library → Reader → Atlas → Academy architecture.
- Atlas as the central retention system.
- Permanent Free tier.
- Premium trial begins intentionally, not automatically on registration.
- Library price: €14.90/month, €129/year.
- Atlas price: €24.90/month, €219/year.
- Academy price: €39.90/month, €349/year.
- Atlas marked **Recommended**.
- Founding Membership: €799 one-time.
- Founding AI subject to fair use.
- Pass It Forward exists separately.
- Support AN.KI exists separately.
- Support does not purchase features.
- Paid tiers are cumulative.
- No mathematically unlimited AI promise.
- No deletion of user intellectual history as downgrade pressure.
- No social-network positioning.
- No streak-based retention as core.
- No generic AI-chat positioning.

---

## 32. Product progression table

| Layer | User value | Data/value that persists | Natural next layer |
|---|---|---|---|
| Free | Understand and trust AN.KI | Early reading history, highlights, notes | Library |
| Library | Full premium reading environment | Books, reading activity, annotations, book-local context | Atlas |
| Atlas | Persistent intellectual memory | Cross-book graph, threads, contradictions, questions, intellectual history | Academy |
| Academy | Structured education | Discipline progress, gaps, prerequisites, synthesis | Continued deep use of the whole system |
| Founding | Lifetime entitlement to the long-term stack | Same accumulated product value as the underlying tiers | Ongoing AN.KI evolution, subject to fair-use AI |

---

## 33. Repository / implementation boundary

This product constitution does not itself authorize modifications to frontend code, backend code, Supabase, billing, database schema, workflows, or configuration. Product implementation is performed in separate scoped engineering tasks against this source of truth.

---

## Frozen decision summary

- AN.KI is an **intellectual reading platform**.
- The core progression is **Library → Reader → Atlas → Academy**.
- Atlas is the central retention system; retention is value-driven, not anxiety-driven.
- Free is a permanent tier, not a trial.
- The premium trial begins on intentional premium access, not automatically at registration.
- Pricing: Free €0; Library €14.90/mo or €129/yr; Atlas €24.90/mo or €219/yr (**Recommended**); Academy €39.90/mo or €349/yr; Founding Membership €799 one-time.
- Paid tiers are cumulative (Atlas ⊇ Library; Academy ⊇ Atlas ⊇ Library).
- Founding Membership grants lifetime access to Library + Atlas + Academy, subject to fair-use AI.
- Pass It Forward and Support AN.KI exist as separate mechanisms, neither is a subscription tier, and Support never purchases features.
- No mathematically unlimited AI promise at any tier.
- No deletion of user intellectual history as downgrade pressure.
- No social-network positioning, no streak-based core retention, no generic AI-chat positioning.

## Genuinely unresolved questions

1. Exact numerical AI quotas per tier.
2. Exact Founding Membership cap (500–1000 range discussed, not decided).
3. Exact composition of the permanent Free book collection.
4. Whether the intent-triggered 14-day trial unlocks Atlas only or the full premium stack.
