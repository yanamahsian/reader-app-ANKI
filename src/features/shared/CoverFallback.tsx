interface CoverFallbackProps {
  title: string;
}

// Shown in place of a book cover whenever `book.cover` is null — which
// is most of the catalog today. Deliberately NOT a generic gray
// placeholder or a bright SaaS-style gradient tile: dark
// burgundy-to-black plate, a thin gold inset frame, and a small
// monogram (the title's first letter) with a modest rule above/below,
// echoing this app's existing collection-tile/collection-detail
// fallback treatment (same burgundy/gold radial-gradient formula) so a
// missing cover reads as "a book this library hasn't photographed yet"
// rather than "broken image". Always the same footprint as a real
// cover — sized entirely by its parent's aspect-ratio (2 / 3), not by
// anything in here.
export function CoverFallback({ title }: CoverFallbackProps) {

  const monogram = (title || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="cover-fallback" aria-hidden="true">
      <span className="cover-fallback-rule" />
      <span className="cover-fallback-monogram">{monogram}</span>
      <span className="cover-fallback-rule" />
    </div>
  );

}
