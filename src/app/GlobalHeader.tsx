interface GlobalHeaderProps {
  onNavigateHome: () => void;
  onNavigateLibrary: () => void;
  onNavigateCollections: () => void;
  onOpenSearch: () => void;
  isAccountMenuOpen: boolean;
  onToggleAccountMenu: () => void;
}

// One thin, persistent, semi-transparent header shown on every
// non-Reader screen (AppShell renders it once; it never remounts on
// navigation). Replaces the old per-page ".mobile-header" that only
// HomeView rendered — Library/Collections/Book Detail/etc. previously
// had no header at all once you left Home.
//
// Interface-language is shown as a static "RU" badge, not a working
// switcher: this app has no i18n system (every string is hardcoded
// Russian), and building one is backend/architecture work outside a
// visual pass — showing a badge that looks clickable but does nothing
// would be worse than an honest static label.
export function GlobalHeader({
  onNavigateHome,
  onNavigateLibrary,
  onNavigateCollections,
  onOpenSearch,
  isAccountMenuOpen,
  onToggleAccountMenu
}: GlobalHeaderProps) {

  return (
    <header className="global-header">

      <button className="global-header-brand" type="button" onClick={onNavigateHome}>
        AN.KI <span>Atlas</span>
      </button>

      <nav className="global-header-nav" aria-label="Основная навигация">
        <button type="button" onClick={onNavigateLibrary}>Библиотека</button>
        <button type="button" onClick={onNavigateCollections}>Подборки</button>
        <button type="button" onClick={onOpenSearch}>Поиск</button>
      </nav>

      <div className="global-header-actions">
        <span className="global-header-lang" aria-hidden="true">RU</span>
        <button
          className="global-header-account"
          type="button"
          aria-label="Аккаунт"
          aria-expanded={isAccountMenuOpen}
          onClick={onToggleAccountMenu}
        >
          <span aria-hidden="true">○</span>
        </button>
      </div>

      <nav className="global-header-mobile-nav" aria-label="Навигация">
        <button type="button" aria-label="Библиотека" onClick={onNavigateLibrary}>⌸</button>
        <button type="button" aria-label="Поиск" onClick={onOpenSearch}>⌕</button>
        <button
          type="button"
          aria-label="Аккаунт"
          aria-expanded={isAccountMenuOpen}
          onClick={onToggleAccountMenu}
        >
          ○
        </button>
      </nav>

    </header>
  );

}
