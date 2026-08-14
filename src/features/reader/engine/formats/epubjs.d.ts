// Deliberately minimal, hand-written types for the "epubjs" package,
// covering only the surface this project actually calls. Written this
// way instead of relying on community @types/epubjs because that
// package's accuracy against the installed epubjs version could not
// be verified offline in this environment — a small, explicit
// contract here is safer than an unverified one.
//
// Corrected against a real, confirmed runtime error ("x.load is not
// a function") plus a matching working example found on
// github.com/futurepress/epub.js (issue #887): `spine.items` holds
// lightweight descriptor objects, not real Section instances --
// `spine.each(callback)` is what yields actual Section objects, and
// their `load()` is called with no arguments (it resolves content
// through the book's own archive on its own). The previous version
// of this file declared `spine.items` as Section-like (with a
// working `.load`) and required a `request` argument -- neither
// matched the real object shape or method signature.
declare module "epubjs" {

  export interface EpubSection {
    href: string;
    idref?: string;
    // Loads and parses this section's content. Called with no
    // arguments -- the Section already knows how to resolve its own
    // content from the book's archive.
    load(): Promise<Document>;
    // Releases the loaded Document; call once its text has been
    // extracted.
    unload(): void;
  }

  export interface EpubSpine {
    // NOTE: deliberately NOT exposing `.items` here -- it exists on
    // the real object, but holds lightweight descriptors without a
    // working `.load()`. `.each()` is the correct way to get real
    // Section instances.
    each(callback: (section: EpubSection) => void): void;
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
    destroy(): void;
  }

}
