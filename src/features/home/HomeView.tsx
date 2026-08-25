import { useEffect, useState } from "react";
import { Hero } from "./Hero";
import { SearchPanel } from "./SearchPanel";
import { getAuthors, getBooksByCollection, getCollectionById } from "../../catalog";
import type { Author } from "../../catalog/types";
import { CollectionCard } from "../collections/CollectionCard";

interface HomeViewProps {
  onOpenBookDetail: (bookId: string, query: string, language: string) => void;
  // collectionId is optional — see App.tsx's handleOpenCollections.
  onOpenCollections: (collectionId?: string) => void;
  restoreSearch: { query: string; language: string } | null;
  onOpenAuthorDetail: (authorId: string) => void;
  onOpenAuthorDetailFromSearch: (authorId: string, query: string, language: string) => void;
  onOpenLibrary: () => void;
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

// Exactly the 6 collections the home page teaser shows, in display
// order — real ids from catalog/collections.ts, the single source of
// truth for title/description/image. Nothing here duplicates that
// data: a missing id is skipped rather than crashing the home page,
// since catalog data can change independently of this curated list.
const HOME_COLLECTION_IDS = [
  "antique-literature",
  "african-literature",
  "essays",
  "poetry",
  "philosophy-and-thought",
  "great-19th-century-novels"
];

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

function getHomeCollections() {
  return HOME_COLLECTION_IDS
    .map(id => getCollectionById(id))
    .filter((collection): collection is NonNullable<typeof collection> => Boolean(collection));
}

// Same image-with-graceful-fallback pattern already used by
// CollectionCard/BookCard/CollectionDetail: an author with no
// portraitImage yet (every seed author, today) shows a monogram
// instead of a broken image, and starts showing a real portrait the
// moment one is set on the Author record — no other change needed.
// Deliberately still the existing plain list row, just with a small
// portrait slot added — not a card/carousel redesign.
function AuthorListItem({ author, onOpen }: { author: Author; onOpen: () => void }) {

  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(author.portraitImage) && !imageFailed;
  const monogram = author.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <button type="button" onClick={onOpen}>
      <span className="author-identity">
        <span className="author-portrait">
          {showImage ? (
            <img
              loading="lazy"
              src={`${import.meta.env.BASE_URL}${author.portraitImage}`}
              alt=""
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="author-portrait-fallback" aria-hidden="true">{monogram}</span>
          )}
        </span>
        <span className="author-name">{author.name}</span>
      </span>
      <span className="author-years">{authorYearsLabel(author) ?? ""}</span>
    </button>
  );

}

export function HomeView({
  onOpenBookDetail,
  onOpenCollections,
  restoreSearch,
  onOpenAuthorDetail,
  onOpenAuthorDetailFromSearch,
  onOpenLibrary
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
  const homeCollections = getHomeCollections();

  return (
    <section id="homeView" className="home-view">

      <div className="home-main">

        <header className="mobile-header">
          <div className="mobile-brand">
            AN.KI
            <span>ATLAS</span>
          </div>
          <div className="mobile-header-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="Библиотека"
              onClick={onOpenLibrary}
            >
              ⌸
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Открыть поиск"
              onClick={() => openSearch()}
            >
              ⌕
            </button>
          </div>
        </header>

        <Hero onOpenSearch={() => openSearch()} onOpenLibrary={onOpenLibrary} />

        <section id="collections" className="editorial-section">

          <div className="section-heading">
            <div>
              <p className="eyebrow">Кураторский выбор</p>
              <h2>Подборки</h2>
            </div>
            <button className="section-link" type="button" onClick={() => onOpenCollections()}>
              Смотреть всё
            </button>
          </div>

          <div className="collections-grid">
            {homeCollections.map(collection => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                bookCount={getBooksByCollection(collection.id).length}
                onOpen={() => onOpenCollections(collection.id)}
              />
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
              <AuthorListItem
                key={author.id}
                author={author}
                onOpen={() => onOpenAuthorDetail(author.id)}
              />
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
