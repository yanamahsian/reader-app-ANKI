import { useState } from "react";
import type { Collection } from "../../catalog/types";
import { pluralizeBooks } from "./pluralize";

interface CollectionCardProps {
  collection: Collection;
  bookCount: number;
  onOpen: () => void;
}

export function CollectionCard({ collection, bookCount, onOpen }: CollectionCardProps) {

  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(collection.image) && !imageFailed;

  return (
    <article className="collection-tile" onClick={onOpen}>

      <div className="collection-tile-image">
        {showImage ? (
          <img
            loading="lazy"
            src={`${import.meta.env.BASE_URL}${collection.image}`}
            alt=""
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="collection-tile-fallback" aria-hidden="true" />
        )}
      </div>

      <div className="collection-tile-body">
        <h3>{collection.title}</h3>
        <p>{collection.description}</p>
        <span className="collection-tile-count">
          {bookCount} {pluralizeBooks(bookCount)}
        </span>
      </div>

    </article>
  );

}
