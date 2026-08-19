import type { Author } from "./types";
import { BATCH_50_AUTHORS } from "./batch50Catalog";

// Core seed authors plus the curated first expansion batch. New authors stay
// data-only: the Reader never changes when another author or Work is added.
export const authors: Author[] = [

  {
    id: "tolstoy",
    name: "Лев Толстой",
    alternativeNames: ["Leo Tolstoy", "Lev Tolstoy", "Толстой Лев Николаевич", "Tolstoi"],
    birthYear: 1828,
    deathYear: 1910
  },
  {
    id: "dostoevsky",
    name: "Фёдор Достоевский",
    alternativeNames: ["Fyodor Dostoevsky", "Dostoyevsky", "Достоевский Фёдор Михайлович"],
    birthYear: 1821,
    deathYear: 1881
  },
  {
    id: "goethe",
    name: "Иоганн Вольфганг фон Гёте",
    alternativeNames: ["Johann Wolfgang von Goethe", "Гете", "Goethe"],
    birthYear: 1749,
    deathYear: 1832
  },
  {
    id: "shakespeare",
    name: "Уильям Шекспир",
    alternativeNames: ["William Shakespeare", "Shakespear", "Шекспир"],
    birthYear: 1564,
    deathYear: 1616
  },
  {
    id: "dante",
    name: "Данте Алигьери",
    alternativeNames: ["Dante Alighieri", "Dante"],
    birthYear: 1265,
    deathYear: 1321
  },
  {
    id: "nietzsche",
    name: "Фридрих Ницше",
    alternativeNames: ["Friedrich Nietzsche", "Ницше", "Nietsche"],
    birthYear: 1844,
    deathYear: 1900
  },
  {
    id: "woolf",
    name: "Вирджиния Вулф",
    alternativeNames: ["Virginia Woolf", "Вулф Вирджиния"],
    birthYear: 1882,
    deathYear: 1941
  },
  {
    id: "wilde",
    name: "Оскар Уайльд",
    alternativeNames: ["Oscar Wilde", "Уайлд"],
    birthYear: 1854,
    deathYear: 1900
  },
  {
    id: "twain",
    name: "Марк Твен",
    alternativeNames: ["Mark Twain", "Samuel Clemens", "Твейн"],
    birthYear: 1835,
    deathYear: 1910
  },
  {
    id: "austen",
    name: "Джейн Остин",
    alternativeNames: ["Jane Austen", "Остен"],
    birthYear: 1775,
    deathYear: 1817
  },
  {
    id: "homer",
    name: "Гомер",
    alternativeNames: ["Homer", "Homeros", "Омир"],
    birthYear: null,
    deathYear: null
  },
  {
    id: "gogol",
    name: "Николай Гоголь",
    alternativeNames: ["Nikolai Gogol", "Гоголь Николай Васильевич"],
    birthYear: 1809,
    deathYear: 1852
  },
  {
    id: "pushkin",
    name: "Александр Пушкин",
    alternativeNames: ["Alexander Pushkin", "Пушкин Александр Сергеевич"],
    birthYear: 1799,
    deathYear: 1837
  },
  {
    id: "tsvetaeva",
    name: "Марина Цветаева",
    alternativeNames: ["Marina Tsvetaeva", "Cvetaeva", "Цветаева"],
    birthYear: 1892,
    deathYear: 1941
  },
  {
    id: "kafka",
    name: "Франц Кафка",
    alternativeNames: ["Franz Kafka", "Кафка"],
    birthYear: 1883,
    deathYear: 1924
  },

  ...BATCH_50_AUTHORS
];
