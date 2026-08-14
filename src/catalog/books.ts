import type { Book } from "./types";

// Seed catalog for Phase 4 -- ~20-30 real works across different
// authors and epochs, enough to exercise the data model and, later,
// ranking. Only "Antichrist" (Nietzsche) has a real seed-era file --
// it is the existing public/books/antichrist.txt, unchanged.
//
// PHASE 8: migrated from the old flat `files` + `rightsStatus` shape
// to `editions: Edition[]`, one seed Edition per work here
// (sourceId: "seed", rights carried over as-is with jurisdiction left
// null -- this project's own data, not yet jurisdiction-reviewed,
// which is an honest gap, not a claim of global validity).
//
// pride-and-prejudice additionally carries a second, REAL edition --
// Project Gutenberg #1342, verified live on gutenberg.org (title,
// author, "Public domain in the USA", and the direct EPUB URL) --
// this is the Phase 8 end-to-end proof: an external source attached
// to an EXISTING seed Work via ingestion/match.ts, never a new Work.
export const books: Book[] = [
  {
    "id": "war-and-peace",
    "title": "Война и мир",
    "originalTitle": "Война и миръ",
    "alternativeTitles": [
      "War and Peace"
    ],
    "authorId": "tolstoy",
    "authorName": "Лев Толстой",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1869,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "war-and-peace",
      "family",
      "society"
    ],
    "description": "Эпопея о русском обществе на фоне наполеоновских войн.",
    "cover": null,
    "collectionIds": [
      "russian-classics",
      "great-19th-century-novels"
    ],
    "editions": [
      {
        "id": "war-and-peace-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "anna-karenina",
    "title": "Анна Каренина",
    "originalTitle": null,
    "alternativeTitles": [
      "Anna Karenina"
    ],
    "authorId": "tolstoy",
    "authorName": "Лев Толстой",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1877,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "love",
      "family",
      "society"
    ],
    "description": "Трагедия личного выбора внутри жёстких правил светского общества.",
    "cover": null,
    "collectionIds": [
      "russian-classics",
      "great-19th-century-novels"
    ],
    "editions": [
      {
        "id": "anna-karenina-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "death-of-ivan-ilyich",
    "title": "Смерть Ивана Ильича",
    "originalTitle": null,
    "alternativeTitles": [
      "The Death of Ivan Ilyich"
    ],
    "authorId": "tolstoy",
    "authorName": "Лев Толстой",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1886,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novella"
    ],
    "themeIds": [
      "death",
      "morality"
    ],
    "description": "Повесть о столкновении с неизбежностью смерти.",
    "cover": null,
    "collectionIds": [
      "russian-classics"
    ],
    "editions": [
      {
        "id": "death-of-ivan-ilyich-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "crime-and-punishment",
    "title": "Преступление и наказание",
    "originalTitle": null,
    "alternativeTitles": [
      "Crime and Punishment"
    ],
    "authorId": "dostoevsky",
    "authorName": "Фёдор Достоевский",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1866,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "morality",
      "society",
      "identity"
    ],
    "description": "Роман о преступлении, совести и наказании изнутри.",
    "cover": null,
    "collectionIds": [
      "russian-classics",
      "great-19th-century-novels"
    ],
    "editions": [
      {
        "id": "crime-and-punishment-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "brothers-karamazov",
    "title": "Братья Карамазовы",
    "originalTitle": null,
    "alternativeTitles": [
      "The Brothers Karamazov"
    ],
    "authorId": "dostoevsky",
    "authorName": "Фёдор Достоевский",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1880,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "faith",
      "family",
      "morality"
    ],
    "description": "Семейная драма как исследование веры, свободы и вины.",
    "cover": null,
    "collectionIds": [
      "russian-classics",
      "great-19th-century-novels"
    ],
    "editions": [
      {
        "id": "brothers-karamazov-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "faust",
    "title": "Фауст",
    "originalTitle": "Faust",
    "alternativeTitles": [],
    "authorId": "goethe",
    "authorName": "Иоганн Вольфганг фон Гёте",
    "originalLanguage": "de",
    "availableLanguages": [
      "de",
      "ru"
    ],
    "publicationYear": 1808,
    "countryId": "germany",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "romanticism",
    "genreIds": [
      "drama",
      "poem"
    ],
    "themeIds": [
      "power",
      "morality"
    ],
    "description": "Трагедия о сделке с дьяволом и цене знания.",
    "cover": null,
    "collectionIds": [
      "foundational-texts"
    ],
    "editions": [
      {
        "id": "faust-seed",
        "language": "de",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "sorrows-of-young-werther",
    "title": "Страдания юного Вертера",
    "originalTitle": "Die Leiden des jungen Werthers",
    "alternativeTitles": [
      "The Sorrows of Young Werther"
    ],
    "authorId": "goethe",
    "authorName": "Иоганн Вольфганг фон Гёте",
    "originalLanguage": "de",
    "availableLanguages": [
      "de",
      "ru"
    ],
    "publicationYear": 1774,
    "countryId": "germany",
    "centuryId": "18",
    "epochId": "enlightenment",
    "movementId": "sentimentalism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "love",
      "death"
    ],
    "description": "Эпистолярный роман, определивший романтическую чувствительность эпохи.",
    "cover": null,
    "collectionIds": [],
    "editions": [
      {
        "id": "sorrows-of-young-werther-seed",
        "language": "de",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "hamlet",
    "title": "Гамлет",
    "originalTitle": "Hamlet",
    "alternativeTitles": [
      "The Tragedy of Hamlet, Prince of Denmark"
    ],
    "authorId": "shakespeare",
    "authorName": "Уильям Шекспир",
    "originalLanguage": "en",
    "availableLanguages": [
      "en",
      "ru"
    ],
    "publicationYear": 1600,
    "countryId": "england",
    "centuryId": "17",
    "epochId": "renaissance",
    "movementId": "renaissance-drama",
    "genreIds": [
      "tragedy",
      "drama"
    ],
    "themeIds": [
      "revenge",
      "power",
      "death"
    ],
    "description": "Трагедия мести, долга и сомнения.",
    "cover": null,
    "collectionIds": [
      "foundational-texts"
    ],
    "editions": [
      {
        "id": "hamlet-seed",
        "language": "en",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "romeo-and-juliet",
    "title": "Ромео и Джульетта",
    "originalTitle": "Romeo and Juliet",
    "alternativeTitles": [],
    "authorId": "shakespeare",
    "authorName": "Уильям Шекспир",
    "originalLanguage": "en",
    "availableLanguages": [
      "en",
      "ru"
    ],
    "publicationYear": 1597,
    "countryId": "england",
    "centuryId": "16",
    "epochId": "renaissance",
    "movementId": "renaissance-drama",
    "genreIds": [
      "tragedy",
      "drama"
    ],
    "themeIds": [
      "love",
      "family"
    ],
    "description": "Трагедия любви, разбивающейся о вражду двух семей.",
    "cover": null,
    "collectionIds": [],
    "editions": [
      {
        "id": "romeo-and-juliet-seed",
        "language": "en",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "divine-comedy",
    "title": "Божественная комедия",
    "originalTitle": "Divina Commedia",
    "alternativeTitles": [
      "La Divina Commedia"
    ],
    "authorId": "dante",
    "authorName": "Данте Алигьери",
    "originalLanguage": "it",
    "availableLanguages": [
      "it",
      "ru"
    ],
    "publicationYear": 1320,
    "countryId": "italy",
    "centuryId": "14",
    "epochId": "medieval",
    "movementId": "medieval-poetry",
    "genreIds": [
      "epic-poem",
      "poem"
    ],
    "themeIds": [
      "faith",
      "morality"
    ],
    "description": "Путешествие через ад, чистилище и рай как карта человеческой души.",
    "cover": null,
    "collectionIds": [
      "foundational-texts"
    ],
    "editions": [
      {
        "id": "divine-comedy-seed",
        "language": "it",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "beyond-good-and-evil",
    "title": "По ту сторону добра и зла",
    "originalTitle": "Jenseits von Gut und Böse",
    "alternativeTitles": [
      "Beyond Good and Evil"
    ],
    "authorId": "nietzsche",
    "authorName": "Фридрих Ницше",
    "originalLanguage": "de",
    "availableLanguages": [
      "de",
      "ru"
    ],
    "publicationYear": 1886,
    "countryId": "germany",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": null,
    "genreIds": [
      "philosophy"
    ],
    "themeIds": [
      "morality",
      "power"
    ],
    "description": "Критика традиционной морали и подготовка к переоценке всех ценностей.",
    "cover": null,
    "collectionIds": [
      "philosophy-and-thought"
    ],
    "editions": [
      {
        "id": "beyond-good-and-evil-seed",
        "language": "de",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "thus-spoke-zarathustra",
    "title": "Так говорил Заратустра",
    "originalTitle": "Also sprach Zarathustra",
    "alternativeTitles": [
      "Thus Spoke Zarathustra"
    ],
    "authorId": "nietzsche",
    "authorName": "Фридрих Ницше",
    "originalLanguage": "de",
    "availableLanguages": [
      "de",
      "ru"
    ],
    "publicationYear": 1883,
    "countryId": "germany",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": null,
    "genreIds": [
      "philosophy",
      "poem"
    ],
    "themeIds": [
      "morality",
      "identity"
    ],
    "description": "Философская поэма о сверхчеловеке и вечном возвращении.",
    "cover": null,
    "collectionIds": [
      "philosophy-and-thought"
    ],
    "editions": [
      {
        "id": "thus-spoke-zarathustra-seed",
        "language": "de",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "the-antichrist",
    "title": "Антихрист",
    "originalTitle": "Der Antichrist",
    "alternativeTitles": [
      "The Antichrist"
    ],
    "authorId": "nietzsche",
    "authorName": "Фридрих Ницше",
    "originalLanguage": "de",
    "availableLanguages": [
      "de",
      "ru"
    ],
    "publicationYear": 1888,
    "countryId": "germany",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": null,
    "genreIds": [
      "philosophy"
    ],
    "themeIds": [
      "faith",
      "morality"
    ],
    "description": "Резкая критика христианской морали как жизнеотрицающей системы ценностей.",
    "cover": null,
    "collectionIds": [
      "philosophy-and-thought"
    ],
    "editions": [
      {
        "id": "the-antichrist-seed",
        "language": "de",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": [
          {
            "format": "plaintext",
            "url": "/reader-app-ANKI/books/antichrist.txt"
          }
        ]
      }
    ]
  },
  {
    "id": "mrs-dalloway",
    "title": "Миссис Дэллоуэй",
    "originalTitle": "Mrs Dalloway",
    "alternativeTitles": [],
    "authorId": "woolf",
    "authorName": "Вирджиния Вулф",
    "originalLanguage": "en",
    "availableLanguages": [
      "en",
      "ru"
    ],
    "publicationYear": 1925,
    "countryId": "england",
    "centuryId": "20",
    "epochId": "modernism",
    "movementId": "modernism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "identity",
      "society"
    ],
    "description": "Один день из жизни героини, рассказанный через поток сознания.",
    "cover": null,
    "collectionIds": [],
    "editions": [
      {
        "id": "mrs-dalloway-seed",
        "language": "en",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "to-the-lighthouse",
    "title": "На маяк",
    "originalTitle": "To the Lighthouse",
    "alternativeTitles": [],
    "authorId": "woolf",
    "authorName": "Вирджиния Вулф",
    "originalLanguage": "en",
    "availableLanguages": [
      "en",
      "ru"
    ],
    "publicationYear": 1927,
    "countryId": "england",
    "centuryId": "20",
    "epochId": "modernism",
    "movementId": "modernism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "family",
      "identity"
    ],
    "description": "Роман о времени, памяти и семье, рассказанный без привычного сюжета.",
    "cover": null,
    "collectionIds": [],
    "editions": [
      {
        "id": "to-the-lighthouse-seed",
        "language": "en",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "picture-of-dorian-gray",
    "title": "Портрет Дориана Грея",
    "originalTitle": "The Picture of Dorian Gray",
    "alternativeTitles": [],
    "authorId": "wilde",
    "authorName": "Оскар Уайльд",
    "originalLanguage": "en",
    "availableLanguages": [
      "en",
      "ru"
    ],
    "publicationYear": 1890,
    "countryId": "ireland",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "aestheticism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "morality",
      "identity"
    ],
    "description": "Роман о цене вечной молодости и невидимой цене порока.",
    "cover": null,
    "collectionIds": [],
    "editions": [
      {
        "id": "picture-of-dorian-gray-seed",
        "language": "en",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "huckleberry-finn",
    "title": "Приключения Гекльберри Финна",
    "originalTitle": "Adventures of Huckleberry Finn",
    "alternativeTitles": [],
    "authorId": "twain",
    "authorName": "Марк Твен",
    "originalLanguage": "en",
    "availableLanguages": [
      "en",
      "ru"
    ],
    "publicationYear": 1884,
    "countryId": "usa",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "coming-of-age",
      "society"
    ],
    "description": "Путешествие по Миссисипи как взросление и столкновение с моралью общества.",
    "cover": null,
    "collectionIds": [
      "great-19th-century-novels"
    ],
    "editions": [
      {
        "id": "huckleberry-finn-seed",
        "language": "en",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "pride-and-prejudice",
    "title": "Гордость и предубеждение",
    "originalTitle": "Pride and Prejudice",
    "alternativeTitles": [],
    "authorId": "austen",
    "authorName": "Джейн Остин",
    "originalLanguage": "en",
    "availableLanguages": [
      "en",
      "ru"
    ],
    "publicationYear": 1813,
    "countryId": "england",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "love",
      "society"
    ],
    "description": "Роман нравов о браке, гордости и первом впечатлении.",
    "cover": null,
    "collectionIds": [
      "great-19th-century-novels"
    ],
    "editions": [
      {
        "id": "pride-and-prejudice-seed",
        "language": "en",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      },
      {
        "id": "pride-and-prejudice-gutenberg-en",
        "language": "en",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": "US"
          }
        ],
        "sourceId": "gutenberg",
        "externalIds": {
          "gutenberg": "1342"
        },
        "files": [
          {
            "format": "epub",
            "url": "https://www.gutenberg.org/ebooks/1342.epub.noimages"
          }
        ]
      }
    ]
  },
  {
    "id": "iliad",
    "title": "Илиада",
    "originalTitle": "Ἰλιάς",
    "alternativeTitles": [
      "Iliad"
    ],
    "authorId": "homer",
    "authorName": "Гомер",
    "originalLanguage": "grc",
    "availableLanguages": [
      "grc",
      "ru"
    ],
    "publicationYear": null,
    "countryId": "ancient-greece",
    "centuryId": "8-bc",
    "epochId": "antiquity",
    "movementId": "epic",
    "genreIds": [
      "epic-poem"
    ],
    "themeIds": [
      "war-and-peace",
      "power"
    ],
    "description": "Эпос о гневе Ахилла и последних неделях Троянской войны.",
    "cover": null,
    "collectionIds": [
      "foundational-texts"
    ],
    "editions": [
      {
        "id": "iliad-seed",
        "language": "grc",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "odyssey",
    "title": "Одиссея",
    "originalTitle": "Ὀδύσσεια",
    "alternativeTitles": [
      "Odyssey"
    ],
    "authorId": "homer",
    "authorName": "Гомер",
    "originalLanguage": "grc",
    "availableLanguages": [
      "grc",
      "ru"
    ],
    "publicationYear": null,
    "countryId": "ancient-greece",
    "centuryId": "8-bc",
    "epochId": "antiquity",
    "movementId": "epic",
    "genreIds": [
      "epic-poem"
    ],
    "themeIds": [
      "identity",
      "family"
    ],
    "description": "Долгое возвращение домой как испытание хитрости и терпения.",
    "cover": null,
    "collectionIds": [
      "foundational-texts"
    ],
    "editions": [
      {
        "id": "odyssey-seed",
        "language": "grc",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "dead-souls",
    "title": "Мёртвые души",
    "originalTitle": null,
    "alternativeTitles": [
      "Dead Souls"
    ],
    "authorId": "gogol",
    "authorName": "Николай Гоголь",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1842,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novel",
      "poem"
    ],
    "themeIds": [
      "society",
      "morality"
    ],
    "description": "Сатирическая поэма-роман о скупке умерших крестьянских душ.",
    "cover": null,
    "collectionIds": [
      "russian-classics"
    ],
    "editions": [
      {
        "id": "dead-souls-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "the-overcoat",
    "title": "Шинель",
    "originalTitle": null,
    "alternativeTitles": [
      "The Overcoat"
    ],
    "authorId": "gogol",
    "authorName": "Николай Гоголь",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1842,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "short-story"
    ],
    "themeIds": [
      "society",
      "identity"
    ],
    "description": "История маленького человека и его единственной мечты.",
    "cover": null,
    "collectionIds": [
      "russian-classics"
    ],
    "editions": [
      {
        "id": "the-overcoat-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "eugene-onegin",
    "title": "Евгений Онегин",
    "originalTitle": null,
    "alternativeTitles": [
      "Eugene Onegin"
    ],
    "authorId": "pushkin",
    "authorName": "Александр Пушкин",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1833,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "romanticism",
    "genreIds": [
      "novel-in-verse"
    ],
    "themeIds": [
      "love",
      "society"
    ],
    "description": "Роман в стихах о скуке, чести и упущенной любви.",
    "cover": null,
    "collectionIds": [
      "russian-classics"
    ],
    "editions": [
      {
        "id": "eugene-onegin-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "the-captains-daughter",
    "title": "Капитанская дочка",
    "originalTitle": null,
    "alternativeTitles": [
      "The Captain's Daughter"
    ],
    "authorId": "pushkin",
    "authorName": "Александр Пушкин",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1836,
    "countryId": "russia",
    "centuryId": "19",
    "epochId": "19th-century",
    "movementId": "realism",
    "genreIds": [
      "novel"
    ],
    "themeIds": [
      "love",
      "morality"
    ],
    "description": "Историческая повесть о чести на фоне пугачёвского восстания.",
    "cover": null,
    "collectionIds": [
      "russian-classics"
    ],
    "editions": [
      {
        "id": "the-captains-daughter-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "evening-album",
    "title": "Вечерний альбом",
    "originalTitle": null,
    "alternativeTitles": [],
    "authorId": "tsvetaeva",
    "authorName": "Марина Цветаева",
    "originalLanguage": "ru",
    "availableLanguages": [
      "ru"
    ],
    "publicationYear": 1910,
    "countryId": "russia",
    "centuryId": "20",
    "epochId": "silver-age",
    "movementId": "symbolism",
    "genreIds": [
      "poetry-collection"
    ],
    "themeIds": [
      "identity",
      "love"
    ],
    "description": "Дебютный сборник стихов, написанный ещё в гимназические годы.",
    "cover": null,
    "collectionIds": [],
    "editions": [
      {
        "id": "evening-album-seed",
        "language": "ru",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  },
  {
    "id": "the-metamorphosis",
    "title": "Превращение",
    "originalTitle": "Die Verwandlung",
    "alternativeTitles": [
      "The Metamorphosis"
    ],
    "authorId": "kafka",
    "authorName": "Франц Кафка",
    "originalLanguage": "de",
    "availableLanguages": [
      "de",
      "ru"
    ],
    "publicationYear": 1915,
    "countryId": "austria-hungary",
    "centuryId": "20",
    "epochId": "modernism",
    "movementId": "modernism",
    "genreIds": [
      "novella"
    ],
    "themeIds": [
      "alienation",
      "family",
      "identity"
    ],
    "description": "Повесть о человеке, превратившемся в насекомое, и о равнодушии семьи.",
    "cover": null,
    "collectionIds": [],
    "editions": [
      {
        "id": "the-metamorphosis-seed",
        "language": "de",
        "isOriginal": true,
        "translatorName": null,
        "rights": [
          {
            "status": "public-domain",
            "jurisdiction": null
          }
        ],
        "sourceId": "seed",
        "externalIds": {},
        "files": []
      }
    ]
  }
];
