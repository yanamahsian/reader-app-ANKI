// Minimal local types for the epubjs surface used by this project.
// Verified against epub.js 0.3.93 source: Section#load(_request)
// receives an optional request function, stores the returned XML
// Document internally, and resolves with `this.contents`, which is
// `xml.documentElement` -- therefore the public result is an Element,
// not the Document itself.
declare module "epubjs" {

  export interface EpubSection {
    href: string;
    idref?: string;
    load(request?: (url: string) => Promise<Document>): Promise<Element>;
    unload(): void;
  }

  export interface EpubSpine {
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
    load(path: string): Promise<Document>;
    destroy(): void;
  }

}
