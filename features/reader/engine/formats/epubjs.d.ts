// Deliberately minimal, hand-written types for the "epubjs" package,
// covering only the surface this project actually calls. Written this
// way instead of relying on community @types/epubjs because that
// package's accuracy against the installed epubjs version could not
// be verified offline in this environment — a small, explicit
// contract here is safer than an unverified one.
//
// Corrected AGAIN this round against the real, literal source of the
// installed version (package.json pins "epubjs": "^0.3.93") fetched
// and read directly from unpkg.com/epubjs@0.3.93/src/{section,spine,
// book,archive}.js -- not assumed, not copied from an example without
// checking. What that source actually shows:
//
//   - Section#load(_request) takes an OPTIONAL request function:
//     `var request = _request || this.request || Request;` -- so
//     calling `item.load()` with NO arguments does NOT mean "the
//     Section resolves its own content automatically". It means
//     "fall back to `this.request` (never set -- Spine#unpack's
//     `new Section(item, this.hooks)` call passes no request/sets no
//     `.request` on the instance, confirmed by reading spine.js) or,
//     failing that, the DEFAULT `Request` module" -- a bare
//     network-fetch helper with zero knowledge of an in-memory
//     archive. That default is exactly what silently broke every
//     Gutenberg EPUB opened from an ArrayBuffer: this project's
//     archived book (epub.archived === true once opened from binary
//     data) gives every Section an in-archive url like
//     "/OEBPS/2600-h/2600-h-0.htm", which the default Request module
//     tries to fetch as if it were a real network URL relative to
//     this app's own origin -- a guaranteed 404/CORS failure for
//     every single spine section, every time.
//   - Book#load(path) is what actually knows how to resolve an
//     archived book's content: `if (this.archived) return
//     this.archive.request(resolved); else return
//     this.request(resolved, ...)`. Archive#request in turn strips
//     the section's leading "/" and looks the entry up directly in
//     the opened zip (`this.zip.file(decodeURIComponent(url.substr(1)))`),
//     parsing it to a Document for xhtml/html -- exactly the shape
//     Section#load's internal `request(this.url).then(xml => ...)`
//     expects back.
//   - Passing `epub.load.bind(epub)` as Section#load's `_request`
//     argument is therefore the verified-correct fix, not a guess:
//     Section#load calls it as `request(this.url)`, a single-argument
//     call, matching Book#load(path)'s single required parameter
//     exactly.
declare module "epubjs" {

  export interface EpubSection {
    href: string;
    idref?: string;
    // Loads and parses this section's content. `request`, when
    // passed, is used instead of the section's own (always-unset,
    // see above) `.request` or the network-only default `Request`
    // module -- pass the archive-aware `Book#load`, bound to the
    // book instance, so an archived (ArrayBuffer-opened) EPUB's
    // spine sections actually resolve through its zip contents
    // instead of a doomed real network fetch.
    load(request?: (url: string) => Promise<Document>): Promise<Document>;
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
    // Resolves a single manifest/spine path's content -- for an
    // archived book (opened from ArrayBuffer, as this project's
    // fetch-then-parse flow does), this routes through the book's own
    // opened zip archive rather than the network. See the module-level
    // comment above for why this specific method, bound to the book
    // instance, is what a Section needs as its `request` function.
    load(path: string): Promise<Document>;
    destroy(): void;
  }

}
