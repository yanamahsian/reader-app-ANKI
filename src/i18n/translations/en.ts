// Canonical translation table (v1 scope only -- Settings + Global
// Header/main navigation + a handful of shared generic labels; see
// src/i18n/index.ts's file-level comment for the full scope note).
//
// This file is the TYPE SOURCE for every other locale: index.ts derives
// `TranslationKey` from `keyof typeof en`, and every other
// translations/*.ts file is typed as `Record<TranslationKey, string>` --
// so a key added here and forgotten in, say, translations/uk.ts is a
// compile error, not a silently-missing string at runtime.
export const en = {
  "common.back": "← Back",
  "common.loading": "Loading…",
  "common.auto": "Auto",

  "nav.ariaPrimary": "Main navigation",
  "nav.ariaMobile": "Navigation",
  "nav.library": "Library",
  "nav.collections": "Collections",
  "nav.search": "Search",
  "nav.account": "Account",

  "account.menuAria": "Account",
  "account.guestNotice": "You're not signed in",
  "account.guestCreateAccount": "Create account",
  "account.guestSignIn": "Sign in",
  "account.navMyLibrary": "My Library",
  "account.navAtlas": "Atlas",
  "account.navNotes": "Notes",
  "account.navProfile": "Profile",
  "account.navSubscription": "Subscription",
  "account.navSettings": "Settings",
  "account.navSupport": "Help & support",
  "account.navSignOut": "Sign out",

  "settings.eyebrow": "Account",
  "settings.title": "Settings",
  "settings.interfaceLanguageTitle": "Interface language",
  "settings.interfaceLanguageNote": "Applies immediately and is saved on this device.",
  "settings.autoOption": "Auto (device language)",
  "settings.bookLanguagesTitle": "Preferred book languages",
  "settings.bookLanguagesNote": "Affects catalog order and each work's default edition — every language stays available.",
  "settings.bookLanguagesAllSelected": "All languages",
  "settings.readerTitle": "Reader",
  "settings.readerNote": "Theme, font, and layout are adjusted directly in reading mode.",
  "settings.privacyTitle": "Privacy & account",
  "settings.privacyNote": "Available once sign-in is connected.",
  "settings.manageData": "Manage data"
} as const;
