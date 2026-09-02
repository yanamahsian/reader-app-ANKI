import type { TranslationKey } from "../index";

// Matches the app's existing hardcoded Russian copy verbatim (see
// GlobalHeader.tsx/AccountMenu.tsx/ShellPage.tsx/SettingsView.tsx before
// this pass) so switching to `ru` -- device-detected or explicit -- is
// visually a no-op for the strings this v1 pass covers.
export const ru: Record<TranslationKey, string> = {
  "common.back": "← Назад",
  "common.loading": "Загрузка…",
  "common.auto": "Авто",

  "nav.ariaPrimary": "Основная навигация",
  "nav.ariaMobile": "Навигация",
  "nav.library": "Библиотека",
  "nav.collections": "Подборки",
  "nav.search": "Поиск",
  "nav.account": "Аккаунт",

  "account.menuAria": "Аккаунт",
  "account.guestNotice": "Вы не авторизованы",
  "account.guestCreateAccount": "Создать аккаунт",
  "account.guestSignIn": "Войти",
  "account.navMyLibrary": "Моя библиотека",
  "account.navAtlas": "Atlas",
  "account.navNotes": "Заметки",
  "account.navProfile": "Профиль",
  "account.navSubscription": "Подписка",
  "account.navSettings": "Настройки",
  "account.navSupport": "Помощь и поддержка",
  "account.navSignOut": "Выйти",

  "settings.eyebrow": "Аккаунт",
  "settings.title": "Настройки",
  "settings.interfaceLanguageTitle": "Язык интерфейса",
  "settings.interfaceLanguageNote": "Применяется сразу и сохраняется на этом устройстве.",
  "settings.autoOption": "Авто (язык устройства)",
  "settings.bookLanguagesTitle": "Предпочтительные языки книг",
  "settings.bookLanguagesNote": "Влияет на порядок каталога и издание по умолчанию для каждого произведения — остальные языки всегда остаются доступны.",
  "settings.bookLanguagesAllSelected": "Все языки",
  "settings.readerTitle": "Reader",
  "settings.readerNote": "Тема, шрифт и вёрстка настраиваются прямо в режиме чтения.",
  "settings.privacyTitle": "Приватность и аккаунт",
  "settings.privacyNote": "Появится после подключения авторизации.",
  "settings.manageData": "Управление данными"
};
