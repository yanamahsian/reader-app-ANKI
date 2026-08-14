import { useState } from "react";
import type { Book } from "../reader/engine/types";
import { Sidebar } from "./Sidebar";
import { Hero } from "./Hero";
import { SearchPanel } from "./SearchPanel";

interface HomeViewProps {
  onOpenBook: (book: Book) => void;
  onOpenCollections: () => void;
}

export function HomeView({ onOpenBook, onOpenCollections }: HomeViewProps) {

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [searchPrefill, setSearchPrefill] = useState<string | null>(null);

  function openSearch(query?: string): void {
    setSidebarOpen(false);
    setSearchPrefill(query ?? "");
    setSearchOpen(true);
  }

  function closeSearch(): void {
    setSearchOpen(false);
    setSearchPrefill(null);
  }

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

        {/* COLLECTIONS */}
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

        {/* AUTHORS */}
        <section id="authors" className="editorial-section authors-section">

          <div className="section-heading">
            <div>
              <p className="eyebrow">Личные библиотеки</p>
              <h2>Авторы</h2>
            </div>
          </div>

          <div className="author-list">

            <button type="button" onClick={() => openSearch("William Shakespeare")}>
              <span>William Shakespeare</span>
              <span>1564–1616</span>
            </button>

            <button type="button" onClick={() => openSearch("Dante Alighieri")}>
              <span>Dante Alighieri</span>
              <span>1265–1321</span>
            </button>

            <button type="button" onClick={() => openSearch("Leo Tolstoy")}>
              <span>Leo Tolstoy</span>
              <span>1828–1910</span>
            </button>

            <button type="button" onClick={() => openSearch("Friedrich Nietzsche")}>
              <span>Friedrich Nietzsche</span>
              <span>1844–1900</span>
            </button>

            <button type="button" onClick={() => openSearch("Virginia Woolf")}>
              <span>Virginia Woolf</span>
              <span>1882–1941</span>
            </button>

          </div>

        </section>

        {/* ACADEMIES */}
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
              {/* Same as the original markup: this button is not wired
                  to any behaviour yet — its intended destination
                  (academies catalogue) does not exist yet, and that is
                  a product decision, not something to guess at here. */}
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
        onClose={closeSearch}
        onOpenBook={onOpenBook}
      />

    </section>
  );

}
