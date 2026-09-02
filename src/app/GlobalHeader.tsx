import { useI18n } from "../i18n";

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
// Internationalization v1: nav labels/aria-labels now come from the
// shared src/i18n layer (useI18n) instead of hardcoded Russian, and the
// language badge reflects the real active locale (SUPPORTED_LOCALES,
// uppercased) rather than a frozen "RU". It stays a plain indicator,
// not a switcher, here -- the actual control lives in Settings
// (SettingsView.tsx), same as the product spec's "Interface language"
// setting is described as living in exactly one place.
export function GlobalHeader({
  onNavigateHome,
  onNavigateLibrary,
  onNavigateCollections,
  onOpenSearch,
  isAccountMenuOpen,
  onToggleAccountMenu
}: GlobalHeaderProps) {

  const { locale, t } = useI18n();

  return (
    <header className="global-header">

      <button className="global-header-brand" type="button" onClick={onNavigateHome}>
        AN.KI
      </button>

      <nav className="global-header-nav" aria-label={t("nav.ariaPrimary")}>
        <button type="button" onClick={onNavigateLibrary}>{t("nav.library")}</button>
        <button type="button" onClick={onNavigateCollections}>{t("nav.collections")}</button>
        <button type="button" onClick={onOpenSearch}>{t("nav.search")}</button>
      </nav>

      <div className="global-header-actions">
        <span className="global-header-lang" aria-hidden="true">{locale.toUpperCase()}</span>
        <button
          className="global-header-account"
          type="button"
          aria-label={t("nav.account")}
          aria-expanded={isAccountMenuOpen}
          onClick={onToggleAccountMenu}
        >
          <span aria-hidden="true">○</span>
        </button>
      </div>

      <nav className="global-header-mobile-nav" aria-label={t("nav.ariaMobile")}>
        <button type="button" aria-label={t("nav.library")} onClick={onNavigateLibrary}>⌸</button>
        <button type="button" aria-label={t("nav.search")} onClick={onOpenSearch}>⌕</button>
        <button
          type="button"
          aria-label={t("nav.account")}
          aria-expanded={isAccountMenuOpen}
          onClick={onToggleAccountMenu}
        >
          ○
        </button>
      </nav>

    </header>
  );

}
