import type { Collection } from "./types";

// Curated AN.KI collections — editorial groupings, deliberately
// separate from system taxonomy (see types.ts). A small starter set;
// books.ts assigns seed books into these via collectionIds.
//
// `image` paths point to real files already uploaded to
// public/collections/. These 4 seed collections don't have titles
// matching any of the 14 named collections the images were prepared
// for, so each was mapped to the closest one by theme (see chat for
// the reasoning) — not a 1:1 title match, flagged for correction if
// wrong.
export const collections: Collection[] = [

  {
    id: "russian-classics",
    title: "Русская классика",
    description: "Романы и повести, определившие русскую литературную традицию.",
    image: "collections/collection_5.png"
  },
  {
    id: "philosophy-and-thought",
    title: "Книги, изменившие европейскую мысль",
    description: "Философская проза, с которой начинались целые эпохи.",
    image: "collections/collection_10.png"
  },
  {
    id: "great-19th-century-novels",
    title: "Великие романы XIX века",
    description: "Романы, задавшие форму классического повествования.",
    image: "collections/collection_2.png"
  },
  {
    id: "foundational-texts",
    title: "Тексты, с которых начинались эпохи",
    description: "Первоисточники — от античного эпоса до раннего модернизма.",
    image: "collections/collection_4.png"
  }

];
