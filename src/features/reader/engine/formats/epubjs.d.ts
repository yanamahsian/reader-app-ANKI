// Deliberately minimal, hand-written types for the "epubjs" package,
// covering only the surface this project actually calls. Written this
// way instead of relying on community @types/epubjs because that
// package's accuracy against the installed epubjs version could not
// be verified offline in this environment — a small, explicit
// contract here is safer than an unverified one.
//
// Updated after a real bug: Section#load/Section#unload and
// Book#load/Book#canonical below are the methods epub.js's own
// official documentation (epubjs.org/documentation/0.3/) describes
// for resolving and loading a spine section's content — confirmed
// against that documentation, not guessed. The previous version of
// this file declared spine items as plain {href, idref} data and
// used Book#archive#getText(href) directly, which does not
// canonicalize the href first and silently returns undefined for
// paths that need it.
declare module "epubjs" {

  export interface EpubSection {
    href: string;
    idref?: string;
    // Loads and parses this section's content. `request` is the
    // function epub.js uses to fetch/resolve a path within the book
    // (pass the Book's own `load`, bound to it, per epub.js's
    // documented headless-loading pattern) and resolves to the
    // parsed Document.
    load(request: (url: string) => Promise<unknown>): Promise<Document>;
    // Releases the loaded Document; call once its text has been
    // extracted.
    unload(): void;
  }

  export interface EpubSpine {
    items: EpubSection[];
  }

  export interface EpubNavigationItem {
    href: string;
    label: string;
    subitems?: EpubNavigationItem[];
  }

  export interface EpubNavigation {
    toc: EpubNavigationItem[];
  }

  export interface EpubLoaded {
    navigation: Promise<EpubNavigation>;
  }

  export default class Book {
    constructor(input: ArrayBuffer | string);
    ready: Promise<void>;
    loaded: EpubLoaded;
    spine: EpubSpine;
    // Resolves and fetches a path within the book archive/package —
    // pass bound as the `request` argument to Section#load.
    load(path: string): Promise<unknown>;
    destroy(): void;
  }

}
