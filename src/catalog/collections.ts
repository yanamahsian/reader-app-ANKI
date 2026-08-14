import type { Collection } from "./types";

// Curated AN.KI collections — editorial groupings, deliberately
// separate from system taxonomy (see types.ts). A small starter set;
// books.ts assigns seed books into these via collectionIds.
//
// `image` paths point to where a real image can be dropped later
// (public/collections/<id>.jpg) — until then these files do not
// exist, and the Collections UI is required to fall back gracefully
// rather than show a broken image.
export const collections: Collection[] = [

  {
    id: "russian-classics",
    title: "Русская классика",
    description: "Романы и повести, определившие русскую литературную традицию.",
    image: "collections/russian-classics.jpg"
  },
  {
    id: "philosophy-and-thought",
    title: "Книги, изменившие европейскую мысль",
    description: "Философская проза, с которой начинались целые эпохи.",
    image: "collections/philosophy-and-thought.jpg"
  },
  {
    id: "great-19th-century-novels",
    title: "Великие романы XIX века",
    description: "Романы, задавшие форму классического повествования.",
    image: "collections/great-19th-century-novels.jpg"
  },
  {
    id: "foundational-texts",
    title: "Тексты, с которых начинались эпохи",
    description: "Первоисточники — от античного эпоса до раннего модернизма.",
    image: "collections/foundational-texts.jpg"
  }

];
