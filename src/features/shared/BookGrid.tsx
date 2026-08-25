import type { ReactNode } from "react";

// Thin, reusable responsive grid wrapper — 5-6 columns on a wide desktop
// screen, 3-4 on tablet, 2 on mobile (all handled in global.css's
// .book-grid rule; nothing here is responsive on its own). Used by
// Library, Author Detail's works list, and Collection Detail, so the
// column-count logic exists in exactly one place.
export function BookGrid({ children }: { children: ReactNode }) {
  return <div className="book-grid">{children}</div>;
}
