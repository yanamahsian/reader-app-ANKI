import type { Author, Book } from "./types";

export interface Batch50Spec {
  workId: string;
  title: string;
  originalTitle: string;
  authorId: string;
  authorSearchName: string;
  publicationYear: number;
}

export const BATCH_50_AUTHORS: Author[] = [
  { id: "dickens", name: "Чарльз Диккенс", alternativeNames: ["Charles Dickens"], birthYear: 1812, deathYear: 1870 },
  { id: "mary-shelley", name: "Мэри Шелли", alternativeNames: ["Mary Shelley", "Mary Wollstonecraft Shelley"], birthYear: 1797, deathYear: 1851 },
  { id: "stevenson", name: "Роберт Льюис Стивенсон", alternativeNames: ["Robert Louis Stevenson"], birthYear: 1850, deathYear: 1894 },
  { id: "lewis-carroll", name: "Льюис Кэрролл", alternativeNames: ["Lewis Carroll", "Charles Lutwidge Dodgson"], birthYear: 1832, deathYear: 1898 },
  { id: "melville", name: "Герман Мелвилл", alternativeNames: ["Herman Melville"], birthYear: 1819, deathYear: 1891 },
  { id: "hawthorne", name: "Натаниэль Готорн", alternativeNames: ["Nathaniel Hawthorne"], birthYear: 1804, deathYear: 1864 },
  { id: "charlotte-bronte", name: "Шарлотта Бронте", alternativeNames: ["Charlotte Brontë", "Charlotte Bronte"], birthYear: 1816, deathYear: 1855 },
  { id: "emily-bronte", name: "Эмили Бронте", alternativeNames: ["Emily Brontë", "Emily Bronte"], birthYear: 1818, deathYear: 1848 },
  { id: "bram-stoker", name: "Брэм Стокер", alternativeNames: ["Bram Stoker", "Abraham Stoker"], birthYear: 1847, deathYear: 1912 },
  { id: "conrad", name: "Джозеф Конрад", alternativeNames: ["Joseph Conrad"], birthYear: 1857, deathYear: 1924 },
  { id: "h-g-wells", name: "Герберт Уэллс", alternativeNames: ["H. G. Wells", "H.G. Wells", "Herbert George Wells"], birthYear: 1866, deathYear: 1946 }
];

export const BATCH_50_SPECS: Batch50Spec[] = [
  { workId: "sense-and-sensibility", title: "Разум и чувства", originalTitle: "Sense and Sensibility", authorId: "austen", authorSearchName: "Jane Austen", publicationYear: 1811 },
  { workId: "emma", title: "Эмма", originalTitle: "Emma", authorId: "austen", authorSearchName: "Jane Austen", publicationYear: 1815 },
  { workId: "mansfield-park", title: "Мэнсфилд-парк", originalTitle: "Mansfield Park", authorId: "austen", authorSearchName: "Jane Austen", publicationYear: 1814 },
  { workId: "northanger-abbey", title: "Нортенгерское аббатство", originalTitle: "Northanger Abbey", authorId: "austen", authorSearchName: "Jane Austen", publicationYear: 1817 },
  { workId: "persuasion", title: "Доводы рассудка", originalTitle: "Persuasion", authorId: "austen", authorSearchName: "Jane Austen", publicationYear: 1817 },

  { workId: "the-voyage-out", title: "По морю прочь", originalTitle: "The Voyage Out", authorId: "woolf", authorSearchName: "Virginia Woolf", publicationYear: 1915 },
  { workId: "night-and-day", title: "Ночь и день", originalTitle: "Night and Day", authorId: "woolf", authorSearchName: "Virginia Woolf", publicationYear: 1919 },
  { workId: "jacobs-room", title: "Комната Джейкоба", originalTitle: "Jacob's Room", authorId: "woolf", authorSearchName: "Virginia Woolf", publicationYear: 1922 },

  { workId: "importance-of-being-earnest", title: "Как важно быть серьёзным", originalTitle: "The Importance of Being Earnest", authorId: "wilde", authorSearchName: "Oscar Wilde", publicationYear: 1895 },
  { workId: "lady-windermeres-fan", title: "Веер леди Уиндермир", originalTitle: "Lady Windermere's Fan", authorId: "wilde", authorSearchName: "Oscar Wilde", publicationYear: 1892 },
  { workId: "an-ideal-husband", title: "Идеальный муж", originalTitle: "An Ideal Husband", authorId: "wilde", authorSearchName: "Oscar Wilde", publicationYear: 1895 },
  { workId: "salome", title: "Саломея", originalTitle: "Salome", authorId: "wilde", authorSearchName: "Oscar Wilde", publicationYear: 1891 },
  { workId: "de-profundis", title: "De Profundis", originalTitle: "De Profundis", authorId: "wilde", authorSearchName: "Oscar Wilde", publicationYear: 1905 },

  { workId: "tom-sawyer", title: "Приключения Тома Сойера", originalTitle: "The Adventures of Tom Sawyer", authorId: "twain", authorSearchName: "Mark Twain", publicationYear: 1876 },
  { workId: "prince-and-pauper", title: "Принц и нищий", originalTitle: "The Prince and the Pauper", authorId: "twain", authorSearchName: "Mark Twain", publicationYear: 1881 },
  { workId: "connecticut-yankee", title: "Янки из Коннектикута при дворе короля Артура", originalTitle: "A Connecticut Yankee in King Arthur's Court", authorId: "twain", authorSearchName: "Mark Twain", publicationYear: 1889 },
  { workId: "life-on-the-mississippi", title: "Жизнь на Миссисипи", originalTitle: "Life on the Mississippi", authorId: "twain", authorSearchName: "Mark Twain", publicationYear: 1883 },
  { workId: "innocents-abroad", title: "Простаки за границей", originalTitle: "The Innocents Abroad", authorId: "twain", authorSearchName: "Mark Twain", publicationYear: 1869 },
  { workId: "roughing-it", title: "Налегке", originalTitle: "Roughing It", authorId: "twain", authorSearchName: "Mark Twain", publicationYear: 1872 },
  { workId: "puddnhead-wilson", title: "Простофиля Вильсон", originalTitle: "Pudd'nhead Wilson", authorId: "twain", authorSearchName: "Mark Twain", publicationYear: 1894 },

  { workId: "macbeth", title: "Макбет", originalTitle: "Macbeth", authorId: "shakespeare", authorSearchName: "William Shakespeare", publicationYear: 1606 },
  { workId: "othello", title: "Отелло", originalTitle: "Othello", authorId: "shakespeare", authorSearchName: "William Shakespeare", publicationYear: 1603 },
  { workId: "king-lear", title: "Король Лир", originalTitle: "King Lear", authorId: "shakespeare", authorSearchName: "William Shakespeare", publicationYear: 1606 },
  { workId: "julius-caesar", title: "Юлий Цезарь", originalTitle: "Julius Caesar", authorId: "shakespeare", authorSearchName: "William Shakespeare", publicationYear: 1599 },
  { workId: "the-tempest", title: "Буря", originalTitle: "The Tempest", authorId: "shakespeare", authorSearchName: "William Shakespeare", publicationYear: 1611 },
  { workId: "a-midsummer-nights-dream", title: "Сон в летнюю ночь", originalTitle: "A Midsummer Night's Dream", authorId: "shakespeare", authorSearchName: "William Shakespeare", publicationYear: 1595 },
  { workId: "twelfth-night", title: "Двенадцатая ночь", originalTitle: "Twelfth Night", authorId: "shakespeare", authorSearchName: "William Shakespeare", publicationYear: 1601 },
  { workId: "merchant-of-venice", title: "Венецианский купец", originalTitle: "The Merchant of Venice", authorId: "shakespeare", authorSearchName: "William Shakespeare", publicationYear: 1596 },

  { workId: "great-expectations", title: "Большие надежды", originalTitle: "Great Expectations", authorId: "dickens", authorSearchName: "Charles Dickens", publicationYear: 1861 },
  { workId: "oliver-twist", title: "Приключения Оливера Твиста", originalTitle: "Oliver Twist", authorId: "dickens", authorSearchName: "Charles Dickens", publicationYear: 1838 },
  { workId: "david-copperfield", title: "Дэвид Копперфильд", originalTitle: "David Copperfield", authorId: "dickens", authorSearchName: "Charles Dickens", publicationYear: 1850 },
  { workId: "a-tale-of-two-cities", title: "Повесть о двух городах", originalTitle: "A Tale of Two Cities", authorId: "dickens", authorSearchName: "Charles Dickens", publicationYear: 1859 },
  { workId: "bleak-house", title: "Холодный дом", originalTitle: "Bleak House", authorId: "dickens", authorSearchName: "Charles Dickens", publicationYear: 1853 },

  { workId: "frankenstein", title: "Франкенштейн", originalTitle: "Frankenstein; Or, The Modern Prometheus", authorId: "mary-shelley", authorSearchName: "Mary Shelley", publicationYear: 1818 },
  { workId: "the-last-man", title: "Последний человек", originalTitle: "The Last Man", authorId: "mary-shelley", authorSearchName: "Mary Shelley", publicationYear: 1826 },
  { workId: "treasure-island", title: "Остров сокровищ", originalTitle: "Treasure Island", authorId: "stevenson", authorSearchName: "Robert Louis Stevenson", publicationYear: 1883 },
  { workId: "jekyll-and-hyde", title: "Странная история доктора Джекила и мистера Хайда", originalTitle: "Strange Case of Dr Jekyll and Mr Hyde", authorId: "stevenson", authorSearchName: "Robert Louis Stevenson", publicationYear: 1886 },
  { workId: "kidnapped", title: "Похищенный", originalTitle: "Kidnapped", authorId: "stevenson", authorSearchName: "Robert Louis Stevenson", publicationYear: 1886 },
  { workId: "alice-in-wonderland", title: "Алиса в Стране чудес", originalTitle: "Alice's Adventures in Wonderland", authorId: "lewis-carroll", authorSearchName: "Lewis Carroll", publicationYear: 1865 },
  { workId: "through-the-looking-glass", title: "Алиса в Зазеркалье", originalTitle: "Through the Looking-Glass", authorId: "lewis-carroll", authorSearchName: "Lewis Carroll", publicationYear: 1871 },
  { workId: "moby-dick", title: "Моби Дик", originalTitle: "Moby Dick; Or, The Whale", authorId: "melville", authorSearchName: "Herman Melville", publicationYear: 1851 },
  { workId: "bartleby", title: "Писец Бартлби", originalTitle: "Bartleby, the Scrivener", authorId: "melville", authorSearchName: "Herman Melville", publicationYear: 1853 },
  { workId: "scarlet-letter", title: "Алая буква", originalTitle: "The Scarlet Letter", authorId: "hawthorne", authorSearchName: "Nathaniel Hawthorne", publicationYear: 1850 },
  { workId: "jane-eyre", title: "Джейн Эйр", originalTitle: "Jane Eyre", authorId: "charlotte-bronte", authorSearchName: "Charlotte Brontë", publicationYear: 1847 },
  { workId: "wuthering-heights", title: "Грозовой перевал", originalTitle: "Wuthering Heights", authorId: "emily-bronte", authorSearchName: "Emily Brontë", publicationYear: 1847 },
  { workId: "dracula", title: "Дракула", originalTitle: "Dracula", authorId: "bram-stoker", authorSearchName: "Bram Stoker", publicationYear: 1897 },
  { workId: "heart-of-darkness", title: "Сердце тьмы", originalTitle: "Heart of Darkness", authorId: "conrad", authorSearchName: "Joseph Conrad", publicationYear: 1899 },
  { workId: "lord-jim", title: "Лорд Джим", originalTitle: "Lord Jim", authorId: "conrad", authorSearchName: "Joseph Conrad", publicationYear: 1900 },
  { workId: "the-time-machine", title: "Машина времени", originalTitle: "The Time Machine", authorId: "h-g-wells", authorSearchName: "H. G. Wells", publicationYear: 1895 },
  { workId: "the-war-of-the-worlds", title: "Война миров", originalTitle: "The War of the Worlds", authorId: "h-g-wells", authorSearchName: "H. G. Wells", publicationYear: 1898 }
];

export const BATCH_50_WORK_IDS = BATCH_50_SPECS.map(spec => spec.workId);

const AUTHOR_DISPLAY_NAMES: Record<string, string> = {
  austen: "Джейн Остин",
  woolf: "Вирджиния Вулф",
  wilde: "Оскар Уайльд",
  twain: "Марк Твен",
  shakespeare: "Уильям Шекспир",
  dickens: "Чарльз Диккенс",
  "mary-shelley": "Мэри Шелли",
  stevenson: "Роберт Льюис Стивенсон",
  "lewis-carroll": "Льюис Кэрролл",
  melville: "Герман Мелвилл",
  hawthorne: "Натаниэль Готорн",
  "charlotte-bronte": "Шарлотта Бронте",
  "emily-bronte": "Эмили Бронте",
  "bram-stoker": "Брэм Стокер",
  conrad: "Джозеф Конрад",
  "h-g-wells": "Герберт Уэллс"
};

export const BATCH_50_BOOKS: Book[] = BATCH_50_SPECS.map(spec => ({
  id: spec.workId,
  title: spec.title,
  originalTitle: spec.originalTitle,
  alternativeTitles: [],
  authorId: spec.authorId,
  authorName: AUTHOR_DISPLAY_NAMES[spec.authorId] ?? spec.authorSearchName,
  originalLanguage: "en",
  availableLanguages: ["en"],
  publicationYear: spec.publicationYear,
  countryId: null,
  centuryId: null,
  epochId: null,
  movementId: null,
  genreIds: [],
  themeIds: [],
  description: `${spec.title} — произведение ${AUTHOR_DISPLAY_NAMES[spec.authorId] ?? spec.authorSearchName}.`,
  cover: null,
  editions: [],
  collectionIds: []
}));
