import { useEffect, useState } from "react";
import { collections } from "../../catalog/collections";
import { getBooksByCollection } from "../../catalog";
import { CollectionCard } from "./CollectionCard";
import { CollectionDetail } from "./CollectionDetail";

interface CollectionsViewProps {
  onOpenBookDetail: (bookId: string, collectionId: string) => void;
  onBack: () => void;
  // Set when arriving here via "← Назад" from Book Detail (or a
  // direct link to a collection) — jumps straight to that
  // collection's detail instead of showing the grid first.
  initialCollectionId: string | null;
}

// Internal list/detail navigation via plain useState, matching the
// rest of this codebase (no router anywhere yet) — introducing one
// just for this screen was explicitly out of scope. Real consequence:
// browser back/forward does not step through it — see the written
// summary for why that trade-off was accepted rather than worked
// around.
export function CollectionsView({ onOpenBookDetail, onBack, initialCollectionId }: CollectionsViewProps) {

  const [selectedId, setSelectedId] = useState<string | null>(initialCollectionId);

  useEffect(() => {
    setSelectedId(initialCollectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = selectedId
    ? collections.find(collection => collection.id === selectedId) ?? null
    : null;

  if (selected) {
    return (
      <CollectionDetail
        collection={selected}
        onBack={() => setSelectedId(null)}
        onOpenBookDetail={bookId => onOpenBookDetail(bookId, selected.id)}
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
