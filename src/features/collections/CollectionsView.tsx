import { useState } from "react";
import { collections } from "../../catalog/collections";
import { getBooksByCollection } from "../../catalog";
import type { Book as ReaderBook } from "../reader/engine/types";
import { CollectionCard } from "./CollectionCard";
import { CollectionDetail } from "./CollectionDetail";

interface CollectionsViewProps {
  onOpenBook: (book: ReaderBook) => void;
  onBack: () => void;
}

// Internal list/detail navigation via plain useState, matching the
// rest of this codebase (no router anywhere yet) — introducing one
// just for this screen was explicitly out of scope. Real consequence:
// this state resets on unmount, and browser back/forward does not
// step through it — see the written summary for why that trade-off
// was accepted rather than worked around.
export function CollectionsView({ onOpenBook, onBack }: CollectionsViewProps) {

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId
    ? collections.find(collection => collection.id === selectedId) ?? null
    : null;

  if (selected) {
    return (
      <CollectionDetail
        collection={selected}
        onBack={() => setSelectedId(null)}
        onOpenBook={onOpenBook}
      />
    );
  }

  return (
    <section className="collections-view">

      <header className="collections-header">
        <button className="text-link" type="button" onClick={onBack}>
          ← Библиотека
        </button>
        <p className="eyebrow" style={{ marginTop: 24 }}>AN.KI Atlas</p>
        <h1>Подборки</h1>
        <p className="collections-subtitle">
          Кураторские маршруты по книгам, которые стоит читать вместе — от эпохи к эпохе, от идеи к идее.
        </p>
      </header>

      <div className="collections-grid">
        {collections.map(collection => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            bookCount={getBooksByCollection(collection.id).length}
            onOpen={() => setSelectedId(collection.id)}
          />
        ))}
      </div>

    </section>
  );

}
