// THE CANON v1 -- small local i18n dictionary for Canon's own UI CHROME
// strings (button labels, loading/error/empty states, editorial metadata
// labels like reading-stage names). Added in the "Polish Canon
// localization and navigation" cleanup pass.
//
// Deliberately NOT folded into the shared src/i18n/translations/*.ts
// tables: those files are explicitly commented as v1 scope = "Settings +
// Global Header/main navigation + a handful of shared generic labels"
// (see src/i18n/index.ts's file-level comment) and are the canonical
// key-set type source (`keyof typeof en`) for six separate locale files.
// Adding ~20 Canon-only keys there would silently widen that table's
// declared scope across all six files -- more invasive than this cleanup
// pass calls for. Canon instead keeps its own small dictionary here,
// typed against the SAME `Locale` type (src/i18n/locale.ts) and driven by
// the SAME `useI18n().locale` value every other localized surface in this
// app already uses -- so it is a real extension of the existing i18n
// mechanism (same locale source of truth, same 6 supported locales, same
// English fallback), not a parallel one. The `i18n-full-ui` branch is not
// touched by this file or anything that imports it.
//
// IMPORTANT: this file is UI CHROME only. Canon CONTENT (collection/path
// titles & descriptions, work rationale) is localized separately via
// `title_i18n` / `description_i18n` / `rationale_i18n` + `resolveCanonText()`
// in src/api/canon.ts -- both untouched here.
import type { Locale } from "../../i18n/locale";
import type { CanonReadingStage } from "../../api/canon";

export interface CanonStrings {
  subtitle: string;
  stage: Record<CanonReadingStage, string>;
  coreWork: string;
  statusFinished: string;
  statusReading: string;
  recommendedBefore: string;
  partOf: string;
  pathCount: (n: number) => string;
  open: string;
  openPath: string;
  backToCanon: string;
  back: string;
  loadingIndex: string;
  loadingCollectionPaths: string;
  loadingPath: string;
  errorCollections: string;
  errorPaths: string;
  errorPath: string;
  emptyIndex: string;
  emptyCollectionPaths: string;
  emptyPathWorks: string;
  pathUnavailable: string;
  workUnavailable: string;
}

// Russian/Ukrainian noun plurals need the same mod10/mod100 three-way
// split AtlasOverview.tsx's own ruCount() helper already uses for its
// stats line. Duplicated here in miniature (not imported) so this stays
// a standalone, self-contained dictionary rather than reaching into an
// unrelated component file for one helper -- consistent with keeping
// Canon's i18n footprint local and small.
function slavicCount(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const CANON_STRINGS: Record<Locale, CanonStrings> = {
  en: {
    subtitle: "A curated map of essential literature.",
    stage: { entry: "Entry", intermediate: "Intermediate", advanced: "Advanced" },
    coreWork: "Core Work",
    statusFinished: "Finished",
    statusReading: "Reading",
    recommendedBefore: "Recommended before this:",
    partOf: "Part of",
    pathCount: n => (n === 1 ? "1 reading path" : `${n} reading paths`),
    open: "Open",
    openPath: "Open reading path",
    backToCanon: "← The Canon",
    back: "← Back",
    loadingIndex: "Gathering the map of The Canon…",
    loadingCollectionPaths: "Loading reading paths…",
    loadingPath: "Loading reading path…",
    errorCollections: "Could not load The Canon.",
    errorPaths: "Could not load reading paths.",
    errorPath: "Could not load this reading path.",
    emptyIndex: "The Canon has not been published yet — the editorial map is being prepared.",
    emptyCollectionPaths: "There are no published reading paths in this collection yet.",
    emptyPathWorks: "This reading path does not have any works yet.",
    pathUnavailable: "This reading path is currently unavailable.",
    workUnavailable: "Work temporarily unavailable"
  },
  ru: {
    subtitle: "Кураторская карта ключевой мировой литературы.",
    stage: { entry: "Начальный", intermediate: "Средний", advanced: "Продвинутый" },
    coreWork: "Ключевая работа",
    statusFinished: "Прочитано",
    statusReading: "Читается",
    recommendedBefore: "Рекомендуется перед этим:",
    partOf: "Входит в",
    pathCount: n => `${n} ${slavicCount(n, "маршрут чтения", "маршрута чтения", "маршрутов чтения")}`,
    open: "Открыть",
    openPath: "Открыть маршрут",
    backToCanon: "← The Canon",
    back: "← Назад",
    loadingIndex: "Собираем карту The Canon…",
    loadingCollectionPaths: "Загружаем маршруты чтения…",
    loadingPath: "Загружаем маршрут чтения…",
    errorCollections: "Не удалось загрузить The Canon.",
    errorPaths: "Не удалось загрузить маршруты чтения.",
    errorPath: "Не удалось загрузить маршрут чтения.",
    emptyIndex: "The Canon пока не опубликован — редакционная карта готовится.",
    emptyCollectionPaths: "В этой коллекции пока нет опубликованных маршрутов чтения.",
    emptyPathWorks: "В этом маршруте чтения пока нет произведений.",
    pathUnavailable: "Этот маршрут чтения сейчас недоступен.",
    workUnavailable: "Работа временно недоступна"
  },
  uk: {
    subtitle: "Кураторська карта ключової світової літератури.",
    stage: { entry: "Початковий", intermediate: "Середній", advanced: "Просунутий" },
    coreWork: "Ключова робота",
    statusFinished: "Прочитано",
    statusReading: "Читається",
    recommendedBefore: "Рекомендовано перед цим:",
    partOf: "Входить до",
    pathCount: n => `${n} ${slavicCount(n, "маршрут читання", "маршрути читання", "маршрутів читання")}`,
    open: "Відкрити",
    openPath: "Відкрити маршрут",
    backToCanon: "← The Canon",
    back: "← Назад",
    loadingIndex: "Збираємо карту The Canon…",
    loadingCollectionPaths: "Завантажуємо маршрути читання…",
    loadingPath: "Завантажуємо маршрут читання…",
    errorCollections: "Не вдалося завантажити The Canon.",
    errorPaths: "Не вдалося завантажити маршрути читання.",
    errorPath: "Не вдалося завантажити маршрут читання.",
    emptyIndex: "The Canon ще не опубліковано — редакційна карта готується.",
    emptyCollectionPaths: "У цій колекції поки немає опублікованих маршрутів читання.",
    emptyPathWorks: "У цьому маршруті читання поки немає творів.",
    pathUnavailable: "Цей маршрут читання зараз недоступний.",
    workUnavailable: "Твір тимчасово недоступний"
  },
  es: {
    subtitle: "Un mapa curado de la literatura esencial.",
    stage: { entry: "Inicial", intermediate: "Intermedio", advanced: "Avanzado" },
    coreWork: "Obra esencial",
    statusFinished: "Terminado",
    statusReading: "Leyendo",
    recommendedBefore: "Recomendado antes de esto:",
    partOf: "Parte de",
    pathCount: n => (n === 1 ? "1 ruta de lectura" : `${n} rutas de lectura`),
    open: "Abrir",
    openPath: "Abrir ruta de lectura",
    backToCanon: "← The Canon",
    back: "← Atrás",
    loadingIndex: "Reuniendo el mapa de The Canon…",
    loadingCollectionPaths: "Cargando rutas de lectura…",
    loadingPath: "Cargando ruta de lectura…",
    errorCollections: "No se pudo cargar The Canon.",
    errorPaths: "No se pudieron cargar las rutas de lectura.",
    errorPath: "No se pudo cargar esta ruta de lectura.",
    emptyIndex: "The Canon aún no se ha publicado — el mapa editorial está en preparación.",
    emptyCollectionPaths: "Todavía no hay rutas de lectura publicadas en esta colección.",
    emptyPathWorks: "Esta ruta de lectura todavía no tiene obras.",
    pathUnavailable: "Esta ruta de lectura no está disponible en este momento.",
    workUnavailable: "Obra temporalmente no disponible"
  },
  de: {
    subtitle: "Eine kuratierte Landkarte der wesentlichen Literatur.",
    stage: { entry: "Einstieg", intermediate: "Mittel", advanced: "Fortgeschritten" },
    coreWork: "Kernwerk",
    statusFinished: "Abgeschlossen",
    statusReading: "Wird gelesen",
    recommendedBefore: "Empfohlen davor:",
    partOf: "Teil von",
    pathCount: n => (n === 1 ? "1 Leseweg" : `${n} Lesewege`),
    open: "Öffnen",
    openPath: "Leseweg öffnen",
    backToCanon: "← The Canon",
    back: "← Zurück",
    loadingIndex: "Die Landkarte von The Canon wird zusammengestellt…",
    loadingCollectionPaths: "Lesewege werden geladen…",
    loadingPath: "Leseweg wird geladen…",
    errorCollections: "The Canon konnte nicht geladen werden.",
    errorPaths: "Lesewege konnten nicht geladen werden.",
    errorPath: "Dieser Leseweg konnte nicht geladen werden.",
    emptyIndex: "The Canon ist noch nicht veröffentlicht — die redaktionelle Landkarte wird vorbereitet.",
    emptyCollectionPaths: "In dieser Sammlung gibt es noch keine veröffentlichten Lesewege.",
    emptyPathWorks: "Dieser Leseweg enthält noch keine Werke.",
    pathUnavailable: "Dieser Leseweg ist derzeit nicht verfügbar.",
    workUnavailable: "Werk vorübergehend nicht verfügbar"
  },
  fr: {
    subtitle: "Une carte éditoriale de la littérature essentielle.",
    stage: { entry: "Initiation", intermediate: "Intermédiaire", advanced: "Avancé" },
    coreWork: "Œuvre essentielle",
    statusFinished: "Terminé",
    statusReading: "En cours",
    recommendedBefore: "Recommandé avant ceci :",
    partOf: "Fait partie de",
    pathCount: n => (n === 1 ? "1 parcours de lecture" : `${n} parcours de lecture`),
    open: "Ouvrir",
    openPath: "Ouvrir le parcours",
    backToCanon: "← The Canon",
    back: "← Retour",
    loadingIndex: "Constitution de la carte de The Canon…",
    loadingCollectionPaths: "Chargement des parcours de lecture…",
    loadingPath: "Chargement du parcours de lecture…",
    errorCollections: "Impossible de charger The Canon.",
    errorPaths: "Impossible de charger les parcours de lecture.",
    errorPath: "Impossible de charger ce parcours de lecture.",
    emptyIndex: "The Canon n'est pas encore publié — la carte éditoriale est en préparation.",
    emptyCollectionPaths: "Cette collection ne contient encore aucun parcours de lecture publié.",
    emptyPathWorks: "Ce parcours de lecture ne contient encore aucune œuvre.",
    pathUnavailable: "Ce parcours de lecture n'est pas disponible pour le moment.",
    workUnavailable: "Œuvre temporairement indisponible"
  }
};

export function getCanonStrings(locale: Locale): CanonStrings {
  return CANON_STRINGS[locale] ?? CANON_STRINGS.en;
}
