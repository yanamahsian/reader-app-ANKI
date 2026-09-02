import { ShellPage } from "../shared/ShellPage";
import { useI18n, type Locale } from "../../i18n";
import { usePreferredBookLanguages } from "../../i18n/bookLanguagePreference";
import { LANGUAGE_OPTIONS, getLanguageLabel } from "../../catalog/languages";

interface SettingsViewProps {
  onBack: () => void;
}

// Internationalization v1. Two independent settings, per the product
// spec:
//
// - Interface language (useI18n, src/i18n/index.ts): which UI strings
//   are shown. One of SUPPORTED_LOCALES, or "Auto" (device/browser
//   locale). Persisted to localStorage immediately on change.
// - Preferred book languages (usePreferredBookLanguages,
//   src/i18n/bookLanguagePreference.ts): zero or more catalog language
//   codes (the full existing LANGUAGE_OPTIONS list, not just the 6 UI
//   locales) that influence Library ranking and each Work's default
//   Edition -- never a filter, and never limits which UI language is
//   shown. See LibraryView.tsx / BookDetailView.tsx for where this is
//   actually consumed.
//
// Both are local-only for now (no synced profile field exists for
// either yet -- see locale.ts's file-level comment); the architecture
// (a plain get/set pair per setting, read once and cached in a
// reactive store) is deliberately the same shape this project already
// uses for readerJurisdiction.ts, so swapping in a real profile-backed
// implementation later doesn't change any calling component.
//
// Preferred book languages has its own Auto state, same shape as
// interface language's: no stored override = Auto, deriving fresh from
// the device locale each time (bookLanguagePreference.ts's
// getEffectivePreferredBookLanguages); an explicit choice -- including
// an explicit empty selection, "no preference" -- is sticky and does
// NOT revert to Auto on its own. Toggling a chip here always starts
// from `effective` (what's currently shown as selected, Auto-derived or
// not), never from the raw stored override, so clicking a language chip
// while still on Auto reads as "add/remove this one" rather than
// silently discarding whatever Auto had already selected.
export function SettingsView({ onBack }: SettingsViewProps) {

  const { locale, isAuto, t, setLocale, resetToAuto, supportedLocales } = useI18n();
  const {
    effective: effectiveBookLanguages,
    isAuto: isBookLanguageAuto,
    setPreferredLanguages,
    resetToAuto: resetBookLanguagesToAuto
  } = usePreferredBookLanguages();

  function toggleBookLanguage(code: string): void {
    if (effectiveBookLanguages.includes(code)) {
      setPreferredLanguages(effectiveBookLanguages.filter(existing => existing !== code));
    } else {
      setPreferredLanguages([...effectiveBookLanguages, code]);
    }
  }

  return (
    <ShellPage onBack={onBack} eyebrow={t("settings.eyebrow")} title={t("settings.title")}>

      <section className="settings-section">
        <h2>{t("settings.interfaceLanguageTitle")}</h2>
        <p className="settings-section-note">{t("settings.interfaceLanguageNote")}</p>
        <div className="settings-lang-row">
          <button
            type="button"
            className={isAuto ? "settings-lang-chip active" : "settings-lang-chip"}
            aria-pressed={isAuto}
            onClick={resetToAuto}
          >
            {t("common.auto")}
          </button>
          {supportedLocales.map((code: Locale) => (
            <button
              key={code}
              type="button"
              className={!isAuto && locale === code ? "settings-lang-chip active" : "settings-lang-chip"}
              aria-pressed={!isAuto && locale === code}
              onClick={() => setLocale(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>{t("settings.bookLanguagesTitle")}</h2>
        <p className="settings-section-note">{t("settings.bookLanguagesNote")}</p>
        <div className="settings-lang-row settings-lang-row-wrap">
          <button
            type="button"
            className={isBookLanguageAuto ? "settings-lang-chip active" : "settings-lang-chip"}
            aria-pressed={isBookLanguageAuto}
            onClick={resetBookLanguagesToAuto}
          >
            {t("common.auto")}
          </button>
          {LANGUAGE_OPTIONS.filter(option => option.value !== "").map(option => (
            <button
              key={option.value}
              type="button"
              className={effectiveBookLanguages.includes(option.value) ? "settings-lang-chip active" : "settings-lang-chip"}
              aria-pressed={effectiveBookLanguages.includes(option.value)}
              onClick={() => toggleBookLanguage(option.value)}
              title={getLanguageLabel(option.value)}
            >
              {option.value.toUpperCase()}
            </button>
          ))}
        </div>
        {effectiveBookLanguages.length === 0 && (
          <p className="settings-section-note">{t("settings.bookLanguagesAllSelected")}</p>
        )}
      </section>

      <section className="settings-section">
        <h2>{t("settings.readerTitle")}</h2>
        <p className="settings-section-note">{t("settings.readerNote")}</p>
      </section>

      <section className="settings-section">
        <h2>{t("settings.privacyTitle")}</h2>
        <p className="settings-section-note">{t("settings.privacyNote")}</p>
        <button type="button" className="text-link" disabled>{t("settings.manageData")}</button>
      </section>

    </ShellPage>
  );
}
