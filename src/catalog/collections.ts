import type { Collection } from "./types";

// Curated AN.KI collections — editorial groupings, deliberately
// separate from system taxonomy (see types.ts). A small starter set;
// books.ts assigns seed books into these via collectionIds.
export const collections: Collection[] = [

  {
    id: "russian-classics",
    title: "Русская классика",
    description: "Романы и повести, определившие русскую литературную традицию."
  },
  {
    id: "philosophy-and-thought",
    title: "Книги, изменившие европейскую мысль",
    description: "Философская проза, с которой начинались целые эпохи."
  },
  {
    id: "great-19th-century-novels",
    title: "Великие романы XIX века",
    description: "Романы, задавшие форму классического повествования."
  },
  {
    id: "foundational-texts",
    title: "Тексты, с которых начинались эпохи",
    description: "Первоисточники — от античного эпоса до раннего модернизма."
  }

];
