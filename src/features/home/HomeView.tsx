import { useEffect, useState } from "react";
import { Hero } from "./Hero";
import { SearchPanel } from "./SearchPanel";
import { getAuthors } from "../../catalog";
import type { Author } from "../../catalog/types";

interface HomeViewProps {
  onOpenBookDetail: (bookId: string, query: string, language: string) => void;
  onOpenCollections: () => void;
  restoreSearch: { query: string; language: string } | null;
  onOpenAuthorDetail: (authorId: string) => void;
  onOpenAuthorDetailFromSearch: (authorId: string, query: string, language: string) => void;
}

function authorYearsLabel(author: Author): string | null {
  if (!author.birthYear && !author.deathYear) return null;
  return `${author.birthYear ?? ""}–${author.deathYear ?? ""}`;
}

const CURATED_HOME_AUTHOR_NAMES = [
  "William Shakespeare",
  "Dante Alighieri",
  "Leo Tolstoy",
  "Friedrich Nietzsche",
  "Virginia Woolf"
];

const HOME_COLLECTIONS = [
  {
    id: "classical-antiquity",
    eyebrow: "Литература",
    title: "Античная литература",
    query: "classical antiquity",
    image: "collections/collection_1.png"
  },
  {
    id: "african-literature",
    eyebrow: "Литературные традиции",
    title: "Африканская литература",
    query: "african literature",
    image: "collections/collection_4.png"
  },
  {
    id: "essays",
    eyebrow: "Форма",
    title: "Эссе",
    query: "essay",
    image: "collections/collection_12.png"
  },
  {
    id: "poetry",
    eyebrow: "Форма",
    title: "Поэзия",
    query: "poetry",
    image: "collections/collection_9.png"
  },
  {
    id: "philosophy-and-thought",
    eyebrow: "Философия",
    title: "Книги, изменившие европейскую мысль",
    query: "philosophy",
    image: "collections/collection_10.png"
  },
  {
    id: "great-19th-century-novels",
    eyebrow: "Литература",
    title: "Великие романы XIX века",
    query: "novel",
    image: "collections/collection_2.png"
  }
] as const;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function getCuratedHomeAuthors(): Author[] {

  const allAuthors = getAuthors();
  const curated: Author[] = [];

  for (const curatedName of CURATED_HOME_AUTHOR_NAMES) {

    const target = normalizeName(curatedName);

    const match = allAuthors.find(author =>
      normalizeName(author.name) === target ||
      author.alternativeNames.some(alt => normalizeName(alt) === target)
    );

    if (match) {
      curated.push(match);
    }

  }

  return curated;

}

export function HomeView({
  onOpenBookDetail,
  onOpenCollections,
  restoreSearch,
  onOpenAuthorDetail,
  onOpenAuthorDetailFromSearch
}: HomeViewProps) {

  const [isSearchOpen, setSearchOpen] = useState(false);
  const [searchPrefill, setSearchPrefill] = useState<string | null>(null);
  const [searchPrefillLanguage, setSearchPrefillLanguage] = useState("");

  function openSearch(query?: string, language?: string): void {
    setSearchPrefill(query ?? "");
    setSearchPrefillLanguage(language ?? "");
    setSearchOpen(true);
  }

  function closeSearch(): void {
    setSearchOpen(false);
    setSearchPrefill(null);
  }

  useEffect(() => {
    if (restoreSearch) {
      openSearch(restoreSearch.query, restoreSearch.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const curatedAuthors = getCuratedHomeAuthors();

  return (
    <section id="homeView" className="home-view">

      <div className="home-main" style={{ marginLeft: 0 }}>

        <header className="mobile-header">
          <div className="mobile-brand">
            AN.KI
            <span>ATLAS</span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Открыть поиск"
            onClick={() => openSearch()}
          >
            ⌕
          </button>
        </header>

        <Hero onOpenSearch={() => openSearch()} />

        <section id="collections" className="editorial-section">

          <div className="section-heading">
            <div>
              <p className="eyebrow">Кураторский выбор</p>
              <h2>Подборки</h2>
            </div>
            <button className="section-link" type="button" onClick={onOpenCollections}>
              Смотреть всё
            </button>
          </div>

          <div className="collection-grid">

            {HOME_COLLECTIONS.map(collection => (
              <article
                key={collection.id}
                className="collection-card"
                style={{
                  minHeight: 390,
                  justifyContent: "flex-end",
                  backgroundImage: `linear-gradient(180deg, rgba(10, 6, 5, 0.06) 20%, rgba(10, 6, 5, 0.92) 100%), url(${collection.image})`,
                  backgroundPosition: "center",
                  backgroundSize: "cover"
                }}
              >
                <div className="collection-card-body">
                  <p>{collection.eyebrow}</p>
                  <h3>{collection.title}</h3>
                  <button type="button" onClick={() => openSearch(collection.query)}>
                    Открыть коллекцию
                  </button>
                </div>
              </article>
            ))}

          </div>

        </section>

        <section id="authors" className="editorial-section authors-section">

          <div className="section-heading">
            <div>
              <p className="eyebrow">Личные библиотеки</p>
              <h2>Авторы</h2>
            </div>
          </div>

          <div className="author-list">

            {curatedAuthors.map(author => (
              <button key={author.id} type="button" onClick={() => onOpenAuthorDetail(author.id)}>
                <span>{author.name}</span>
                <span>{authorYearsLabel(author) ?? ""}</span>
              </button>
            ))}

          </div>

        </section>

        <section id="academies" className="editorial-section academy-section">

          <div className="academy-panel">

            <div className="academy-copy">
              <p className="eyebrow">AN.KI Academies</p>
              <h2>Не просто читать.<br />Понимать эпоху.</h2>
              <p>
                Последовательные маршруты по философии,
                литературе, истории и искусству:
                первоисточники, контекст и интеллектуальные
                связи между текстами.
              </p>
              <button className="primary-button" type="button">
                Посмотреть академии
              </button>
            </div>

            <div className="academy-index" aria-hidden="true">
              <span>I</span>
              <span>II</span>
              <span>III</span>
              <span>IV</span>
            </div>

          </div>

        </section>

        <footer className="site-footer">
          <div>AN.KI Atlas</div>
        </footer>

      </div>

      <SearchPanel
        isOpen={isSearchOpen}
        prefillQuery={searchPrefill}
        prefillLanguage={searchPrefillLanguage}
        onClose={closeSearch}
        onOpenBookDetail={onOpenBookDetail}
        onOpenAuthorDetail={onOpenAuthorDetailFromSearch}
      />

    </section>
  );

}
