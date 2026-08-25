import type { Collection } from "./types";

// Curated AN.KI collections — editorial groupings, deliberately
// separate from system taxonomy (see types.ts). This is the single
// source of truth for permanent editorial collections: HomeView's
// teaser strip and the full CollectionsView both read from this list
// by id — no page hardcodes its own copy of a title, description or
// image. books.ts/batch50.ts assign seed books into these via
// collectionIds.
//
// image is either:
//   - "collections/<id>.png"  — a real, purpose-made asset exists at
//     that exact path under public/collections/, or
//   - null                    — no image yet.
// Never an approximate/borrowed filename (the old collection_1.png..
// collection_14.png placeholders). None of the 8 collections below has
// its real image made yet, so every one is null for now — CollectionCard
// already renders a plain fallback tile for null, never a broken image.
// The moment a real asset lands at e.g. public/collections/poetry.png,
// flip that entry's image to "collections/poetry.png" — no other file
// needs to change. The same convention extends to seasonal collections
// later (e.g. image: "collections/seasonal/christmas-2026.png").
export const collections: Collection[] = [

  {
    id: "russian-classics",
    title: "Русская классика",
    description: "Романы и повести, определившие русскую литературную традицию.",
    image: null
  },
  {
    id: "philosophy-and-thought",
    title: "Книги, изменившие европейскую мысль",
    description: "Философская проза, с которой начинались целые эпохи.",
    image: null
  },
  {
    id: "great-19th-century-novels",
    title: "Великие романы XIX века",
    description: "Романы, задавшие форму классического повествования.",
    image: null
  },
  {
    id: "foundational-texts",
    title: "Тексты, с которых начинались эпохи",
    description: "Первоисточники — от античного эпоса до раннего модернизма.",
    image: null
  },
  {
    id: "antique-literature",
    title: "Античная литература",
    description: "Эпос, трагедия и философия от Гомера до поздней античности.",
    image: null
  },
  {
    id: "african-literature",
    title: "Африканская литература",
    description: "Литературные традиции африканского континента, от устного эпоса до модернизма.",
    image: null
  },
  {
    id: "essays",
    title: "Эссе",
    description: "Свободная проза мысли — очерки и размышления.",
    image: null
  },
  {
    id: "poetry",
    title: "Поэзия",
    description: "Стихи и поэмы разных эпох и традиций.",
    image: null
  }

];
