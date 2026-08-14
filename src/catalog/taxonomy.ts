import type { TaxonomyTerm } from "./types";

// System taxonomy: facts about a work's place in literary history.
// Kept separate from collections.ts (AN.KI's own editorial picks) on
// purpose — see types.ts. Every id here is referenced from books.ts;
// this seed only defines the terms actually used by the seed catalog,
// not an exhaustive taxonomy.

export const epochs: TaxonomyTerm[] = [
  { id: "antiquity", label: "Античность" },
  { id: "medieval", label: "Средневековье" },
  { id: "renaissance", label: "Возрождение" },
  { id: "enlightenment", label: "Просвещение" },
  { id: "19th-century", label: "XIX век" },
  { id: "silver-age", label: "Серебряный век" },
  { id: "modernism", label: "Модернизм" }
];

export const centuries: TaxonomyTerm[] = [
  { id: "8-bc", label: "VIII век до н.э." },
  { id: "14", label: "XIV век" },
  { id: "16", label: "XVI век" },
  { id: "17", label: "XVII век" },
  { id: "18", label: "XVIII век" },
  { id: "19", label: "XIX век" },
  { id: "20", label: "XX век" }
];

export const countries: TaxonomyTerm[] = [
  { id: "russia", label: "Россия" },
  { id: "germany", label: "Германия" },
  { id: "england", label: "Англия" },
  { id: "italy", label: "Италия" },
  { id: "ancient-greece", label: "Древняя Греция" },
  { id: "usa", label: "США" },
  { id: "ireland", label: "Ирландия" },
  { id: "austria-hungary", label: "Австро-Венгрия" }
];

export const movements: TaxonomyTerm[] = [
  { id: "epic", label: "Эпос" },
  { id: "medieval-poetry", label: "Средневековая поэзия" },
  { id: "renaissance-drama", label: "Драматургия Возрождения" },
  { id: "sentimentalism", label: "Сентиментализм" },
  { id: "romanticism", label: "Романтизм" },
  { id: "realism", label: "Реализм" },
  { id: "aestheticism", label: "Эстетизм" },
  { id: "modernism", label: "Модернизм" },
  { id: "symbolism", label: "Символизм" }
];

export const genres: TaxonomyTerm[] = [
  { id: "novel", label: "Роман" },
  { id: "novel-in-verse", label: "Роман в стихах" },
  { id: "novella", label: "Повесть" },
  { id: "short-story", label: "Рассказ" },
  { id: "drama", label: "Драма" },
  { id: "tragedy", label: "Трагедия" },
  { id: "epic-poem", label: "Эпическая поэма" },
  { id: "poem", label: "Поэма" },
  { id: "poetry-collection", label: "Сборник стихов" },
  { id: "philosophy", label: "Философская проза" }
];

export const themes: TaxonomyTerm[] = [
  { id: "war-and-peace", label: "Война и мир" },
  { id: "love", label: "Любовь" },
  { id: "death", label: "Смерть" },
  { id: "morality", label: "Мораль" },
  { id: "identity", label: "Идентичность" },
  { id: "society", label: "Общество" },
  { id: "family", label: "Семья" },
  { id: "faith", label: "Вера" },
  { id: "power", label: "Власть" },
  { id: "alienation", label: "Отчуждение" },
  { id: "revenge", label: "Месть" },
  { id: "coming-of-age", label: "Взросление" }
];
