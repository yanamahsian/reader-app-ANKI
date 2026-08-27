import { scoreAtlasPair } from "./src/features/atlas/buildAtlas";
import type { Book } from "./src/catalog";

const makeBook = (overrides: Partial<Book>): Book => ({
  id: "base",
  title: "Base",
  originalTitle: null,
  alternativeTitles: [],
  authorId: "author-a",
  authorName: "Author A",
  originalLanguage: "en",
  availableLanguages: ["en"],
  publicationYear: null,
  countryId: null,
  centuryId: null,
  epochId: null,
  movementId: null,
  genreIds: [],
  themeIds: [],
  description: "",
  cover: null,
  editions: [],
  collectionIds: [],
  ...overrides
});

const crime = makeBook({
  id: "crime-and-punishment",
  title: "Преступление и наказание",
  authorId: "dostoevsky",
  authorName: "Достоевский",
  publicationYear: 1866,
  countryId: "russian-literature",
  centuryId: "19",
  epochId: "long-nineteenth-century",
  movementId: "realism",
  genreIds: ["novel"],
  themeIds: ["morality", "identity"],
  collectionIds: ["russian-classics", "great-19th-century-novels"]
});

const anna = makeBook({
  id: "anna-karenina",
  title: "Анна Каренина",
  authorId: "tolstoy",
  authorName: "Толстой",
  publicationYear: 1877,
  countryId: "russian-literature",
  centuryId: "19",
  epochId: "long-nineteenth-century",
  movementId: "realism",
  genreIds: ["novel"],
  themeIds: ["love", "family"],
  collectionIds: ["russian-classics", "great-19th-century-novels"]
});

const kafka = makeBook({
  id: "the-metamorphosis",
  title: "Превращение",
  authorId: "kafka",
  authorName: "Кафка",
  publicationYear: 1915,
  countryId: "german-literature",
  centuryId: "20",
  epochId: "early-twentieth-century",
  movementId: "modernism",
  genreIds: ["novella"],
  themeIds: ["alienation", "family", "identity"]
});

const unrelated = makeBook({ id: "unrelated", title: "Unrelated", authorId: "other", authorName: "Other", publicationYear: 1700 });

const historical = scoreAtlasPair(crime, anna);
const thematic = scoreAtlasPair(crime, kafka);
const none = scoreAtlasPair(crime, unrelated);

if (!historical || historical.score < 8) throw new Error("Expected strong Crime and Punishment ↔ Anna Karenina connection");
if (!thematic || !thematic.reasons.some(reason => reason.kind === "theme")) throw new Error("Expected Crime and Punishment ↔ Metamorphosis theme connection");
if (none !== null) throw new Error("Unrelated books must not get an Atlas edge");

console.log("ATLAS_SMOKE_OK", {
  historicalScore: historical.score,
  historicalReasons: historical.reasons.map(reason => reason.kind),
  thematicScore: thematic.score,
  thematicReasons: thematic.reasons.map(reason => reason.kind)
});
