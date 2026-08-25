import type { Author } from "./types";

// Seed authors for the Phase 4 catalog (~15). alternativeNames covers
// common transliteration/spelling variants — this is exactly the data
// the future Search phase will need to rank on, per the architecture
// requirement, even though no search algorithm is implemented here.
//
// portraitImage is null for every entry below: no generated portraits
// exist yet. UI must fall back gracefully (a monogram, same pattern
// as BookCard's cover fallback) — this is the documented
// not-yet-generated state, not an oversight. The future path
// convention is "authors/<author-id>.png" (see types.ts).
export const authors: Author[] = [

  {
    id: "tolstoy",
    name: "Лев Толстой",
    alternativeNames: ["Leo Tolstoy", "Lev Tolstoy", "Толстой Лев Николаевич", "Tolstoi"],
    birthYear: 1828,
    deathYear: 1910,
    portraitImage: null
  },
  {
    id: "dostoevsky",
    name: "Фёдор Достоевский",
    alternativeNames: ["Fyodor Dostoevsky", "Dostoyevsky", "Достоевский Фёдор Михайлович"],
    birthYear: 1821,
    deathYear: 1881,
    portraitImage: null
  },
  {
    id: "goethe",
    name: "Иоганн Вольфганг фон Гёте",
    alternativeNames: ["Johann Wolfgang von Goethe", "Гете", "Goethe"],
    birthYear: 1749,
    deathYear: 1832,
    portraitImage: null
  },
  {
    id: "shakespeare",
    name: "Уильям Шекспир",
    alternativeNames: ["William Shakespeare", "Shakespear", "Шекспир"],
    birthYear: 1564,
    deathYear: 1616,
    portraitImage: null
  },
  {
    id: "dante",
    name: "Данте Алигьери",
    alternativeNames: ["Dante Alighieri", "Dante"],
    birthYear: 1265,
    deathYear: 1321,
    portraitImage: null
  },
  {
    id: "nietzsche",
    name: "Фридрих Ницше",
    alternativeNames: ["Friedrich Nietzsche", "Ницше", "Nietsche"],
    birthYear: 1844,
    deathYear: 1900,
    portraitImage: null
  },
  {
    id: "woolf",
    name: "Вирджиния Вулф",
    alternativeNames: ["Virginia Woolf", "Вулф Вирджиния"],
    birthYear: 1882,
    deathYear: 1941,
    portraitImage: null
  },
  {
    id: "wilde",
    name: "Оскар Уайльд",
    alternativeNames: ["Oscar Wilde", "Уайлд"],
    birthYear: 1854,
    deathYear: 1900,
    portraitImage: null
  },
  {
    id: "twain",
    name: "Марк Твен",
    alternativeNames: ["Mark Twain", "Samuel Clemens", "Твейн"],
    birthYear: 1835,
    deathYear: 1910,
    portraitImage: null
  },
  {
    id: "austen",
    name: "Джейн Остин",
    alternativeNames: ["Jane Austen", "Остен"],
    birthYear: 1775,
    deathYear: 1817,
    portraitImage: null
  },
  {
    id: "homer",
    name: "Гомер",
    alternativeNames: ["Homer", "Homeros", "Омир"],
    birthYear: null,
    deathYear: null,
    portraitImage: null
  },
  {
    id: "gogol",
    name: "Николай Гоголь",
    alternativeNames: ["Nikolai Gogol", "Гоголь Николай Васильевич"],
    birthYear: 1809,
    deathYear: 1852,
    portraitImage: null
  },
  {
    id: "pushkin",
    name: "Александр Пушкин",
    alternativeNames: ["Alexander Pushkin", "Пушкин Александр Сергеевич"],
    birthYear: 1799,
    deathYear: 1837,
    portraitImage: null
  },
  {
    id: "tsvetaeva",
    name: "Марина Цветаева",
    alternativeNames: ["Marina Tsvetaeva", "Cvetaeva", "Цветаева"],
    birthYear: 1892,
    deathYear: 1941,
    portraitImage: null
  },
  {
    id: "kafka",
    name: "Франц Кафка",
    alternativeNames: ["Franz Kafka", "Кафка"],
    birthYear: 1883,
    deathYear: 1924,
    portraitImage: null
  }

];
