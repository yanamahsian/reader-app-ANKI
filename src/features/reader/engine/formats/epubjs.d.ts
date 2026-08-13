// Deliberately minimal, hand-written types for the "epubjs" package,
// covering only the surface this project actually calls. Written this
// way instead of relying on community @types/epubjs because that
// package's accuracy against the installed epubjs version could not
// be verified offline in this environment — a small, explicit
// contract here is safer than an unverified one. If a future
// `npm run build` in CI reveals a real mismatch with epubjs's actual
// runtime shape, this file is the one place to correct it.
declare module "epubjs" {

  export interface EpubSpineItem {
    href: string;
    idref?: string;
  }

  export interface EpubSpine {
    items: EpubSpineItem[];
  }

  export interface EpubNavigationItem {
    href: string;
    label: string;
    subitems?: EpubNavigationItem[];
  }

  export interface EpubNavigation {
    toc: EpubNavigationItem[];
  }

  export interface EpubArchive {
    getText(href: string): Promise<string>;
  }

  export interface EpubLoaded {
    navigation: Promise<EpubNavigation>;
  }

  export default class Book {
    constructor(input: ArrayBuffer | string);
    ready: Promise<void>;
    loaded: EpubLoaded;
    spine: EpubSpine;
    archive: EpubArchive;
    destroy(): void;
  }

}
