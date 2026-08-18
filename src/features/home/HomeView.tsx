import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
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

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [searchPrefill, setSearchPrefill] = useState<string | null>(null);
  const [searchPrefillLanguage, setSearchPrefillLanguage] = useState("");

  function openSearch(query?: string, language?: string): void {
    setSidebarOpen(false);
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

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSearch={() => openSearch()}
        onOpenCollections={onOpenCollections}
      />

      <div className="home-main">

        <header className="mobile-header">
          <button
            className="icon-button"
            type="button"
            aria-label="Открыть меню"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
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
            <button className="section-link" type="button" onClick={() => openSearch("классика")}>
              Смотреть всё
            </button>
          </div>

          <div className="collection-grid">

            <article className="collection-card collection-card-featured">
              <div className="collection-number">01</div>
              <div className="collection-card-body">
                <p>Большая коллекция</p>
                <h3>Книги, изменившие европейскую мысль</h3>
                <button type="button" onClick={() => openSearch("philosophy")}>Открыть коллекцию</button>
              </div>
            </article>

            <article className="collection-card">
              <div className="collection-number">02</div>
              <div className="collection-card-body">
                <p>История</p>
                <h3>От античности до Нового времени</h3>
                <button type="button" onClick={() => openSearch("history")}>Открыть коллекцию</button>
              </div>
            </article>

            <article className="collection-card">
              <div className="collection-number">03</div>
              <div className="collection-card-body">
                <p>Литература</p>
                <h3>Великие романы XIX века</h3>
                <button type="button" onClick={() => openSearch("novel")}>Открыть коллекцию</button>
              </div>
            </article>

            <article className="collection-card">
              <div className="collection-number">04</div>
              <div className="collection-card-body">
                <p>Первоисточники</p>
                <h3>Тексты, с которых начинались эпохи</h3>
                <button type="button" onClick={() => openSearch("classics")}>Открыть коллекцию</button>
              </div>
            </article>

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
          <p>Интеллектуальная читалка без границ.</p>
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
