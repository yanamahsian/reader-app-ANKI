// THE CANON v1 -- Atlas UI. A curated intellectual map of literature
// (traditions -> collections -> reading paths -> works), NOT a "required
// reading" list -- see src/api/canon.ts's header comment for the full
// data-model rationale. This component owns its own small index ->
// collection -> path sub-navigation (there is no router in this app --
// see AtlasView.tsx's own comment on scroll-based section navigation --
// so Canon's inherent hierarchy is handled entirely with local state,
// never a new top-level route or a second Book Detail screen).
//
// Deliberately mounted only inside AtlasView's existing
// isAuthenticated-gated branch, exactly like every other Atlas section
// (Threads, Memory, Connections, ...) -- Canon does not introduce a
// separate guest-vs-signed-in policy of its own. Reading-progress
// display reuses whatever LibraryEntry[] AtlasView already loaded (no
// second user_library fetch); clicking a work reuses the exact same
// onOpenBookDetail callback every other Atlas surface uses -- there is
// no Canon-specific Book Detail.
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import {
  getCanonCollections,
  getCanonPathsForCollection,
  getCanonPath,
  resolveCanonText,
  canonEpochLabel,
  canonMovementLabel,
  canonGenreLabels,
  type CanonCollection,
  type CanonPathSummary,
  type CanonPathDetail,
  type CanonPathWork
} from "../../api/canon";
import type { LibraryEntry, LibraryStatus } from "../../api/userLibrary";
import { GuestNotice } from "../shared/GuestNotice";
import { getCanonStrings } from "./canonStrings";

interface AtlasCanonSectionProps {
  libraryEntries: LibraryEntry[];
  onOpenBookDetail: (workId: string) => void;
}

type LoadState<T> = { kind: "loading" } | { kind: "loaded"; data: T } | { kind: "error"; text: string };

// `path` carries `originCollectionId` -- the collection screen the path
// was opened FROM, not a "parent" derived from the database (a path can
// belong to more than one collection, so there is no single correct
// parent to look up). Set when the path is opened via a collection's
// path list; left `null` when a path is ever opened with no known origin
// (not reachable from this component today, but kept correct for a
// future direct-link entry point) so the back button below has an
// explicit, safe fallback instead of guessing.
type CanonView =
  | { kind: "index" }
  | { kind: "collection"; collectionId: string }
  | { kind: "path"; pathId: string; originCollectionId: string | null };

export function AtlasCanonSection({ libraryEntries, onOpenBookDetail }: AtlasCanonSectionProps) {
  const { locale } = useI18n();
  const strings = getCanonStrings(locale);
  const [view, setView] = useState<CanonView>({ kind: "index" });
  const [collectionsState, setCollectionsState] = useState<LoadState<CanonCollection[]>>({ kind: "loading" });
  const [pathsState, setPathsState] = useState<LoadState<CanonPathSummary[]> | null>(null);
  const [pathDetailState, setPathDetailState] = useState<LoadState<CanonPathDetail | null> | null>(null);

  const libraryStatusByWorkId = useMemo(() => {
    const map = new Map<string, LibraryStatus>();
    for (const entry of libraryEntries) map.set(entry.workId, entry.status);
    return map;
  }, [libraryEntries]);

  useEffect(() => {
    let cancelled = false;
    getCanonCollections()
      .then(collections => {
        if (!cancelled) setCollectionsState({ kind: "loaded", data: collections });
      })
      .catch(error => {
        console.error("getCanonCollections failed:", error);
        if (!cancelled) setCollectionsState({ kind: "error", text: strings.errorCollections });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (view.kind !== "collection") return;
    let cancelled = false;
    setPathsState({ kind: "loading" });
    getCanonPathsForCollection(view.collectionId)
      .then(paths => {
        if (!cancelled) setPathsState({ kind: "loaded", data: paths });
      })
      .catch(error => {
        console.error("getCanonPathsForCollection failed:", error);
        if (!cancelled) setPathsState({ kind: "error", text: strings.errorPaths });
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    if (view.kind !== "path") return;
    let cancelled = false;
    setPathDetailState({ kind: "loading" });
    getCanonPath(view.pathId)
      .then(detail => {
        if (!cancelled) setPathDetailState({ kind: "loaded", data: detail });
      })
      .catch(error => {
        console.error("getCanonPath failed:", error);
        if (!cancelled) setPathDetailState({ kind: "error", text: strings.errorPath });
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  function renderWorkRow(pathWork: CanonPathWork) {
    const book = pathWork.work;
    const metaParts: string[] = [];

    if (book) {
      if (book.authorName) metaParts.push(book.authorName);
      if (book.publicationYear) metaParts.push(String(book.publicationYear));
      metaParts.push(...canonGenreLabels(book));
      const movementLabel = canonMovementLabel(book);
      if (movementLabel) metaParts.push(movementLabel);
      const epochLabel = canonEpochLabel(book);
      if (epochLabel) metaParts.push(epochLabel);
    }
    if (pathWork.readingStage) metaParts.push(strings.stage[pathWork.readingStage]);
    if (pathWork.isCore) metaParts.push(strings.coreWork);

    const libraryStatus = book ? libraryStatusByWorkId.get(book.id) : undefined;
    if (libraryStatus === "finished") metaParts.push(strings.statusFinished);
    else if (libraryStatus === "reading") metaParts.push(strings.statusReading);

    const rationaleText = pathWork.rationale
      ? resolveCanonText(pathWork.rationale, pathWork.rationaleI18n, locale)
      : null;

    return (
      <article key={pathWork.id} className="notes-card">
        <p className="eyebrow">{String(pathWork.position).padStart(2, "0")}</p>
        <h3 className="plan-card-name">{book?.title ?? strings.workUnavailable}</h3>
        {metaParts.length > 0 && <p className="notes-card-edition">{metaParts.join(" · ")}</p>}
        {rationaleText && <p className="notes-card-note">{rationaleText}</p>}
        {pathWork.prerequisiteWork && (
          <p className="settings-section-note">
            {strings.recommendedBefore} {pathWork.prerequisiteWork.title}
          </p>
        )}
        {book && (
          <div className="notes-card-actions">
            <button type="button" className="text-link" onClick={() => onOpenBookDetail(book.id)}>
              {strings.open}
            </button>
          </div>
        )}
      </article>
    );
  }

  function renderPathDetail(path: CanonPathDetail) {
    return (
      <>
        <h3 className="plan-card-name">{resolveCanonText(path.title, path.titleI18n, locale)}</h3>
        {path.description && (
          <p className="settings-section-note">{resolveCanonText(path.description, path.descriptionI18n, locale)}</p>
        )}
        {path.collections.length > 0 && (
          <p className="notes-card-edition">
            {strings.partOf} {path.collections.map(c => resolveCanonText(c.title, c.titleI18n, locale)).join(" · ")}
          </p>
        )}
        <div className="notes-group-items">{path.works.map(pathWork => renderWorkRow(pathWork))}</div>
      </>
    );
  }

  function renderPath(originCollectionId: string | null) {
    // Back goes to the collection this path was actually opened FROM
    // (carried in view state -- see the CanonView type comment above),
    // never a "parent" guessed from the database, since a path can
    // belong to more than one collection. Only a path opened with no
    // known origin (not reachable today, but kept correct for a future
    // direct-link entry point) falls back to the Canon index.
    const goBack = () =>
      originCollectionId
        ? setView({ kind: "collection", collectionId: originCollectionId })
        : setView({ kind: "index" });

    return (
      <>
        <div className="notes-card-actions">
          <button type="button" className="text-link" onClick={goBack}>
            {originCollectionId ? strings.back : strings.backToCanon}
          </button>
        </div>
        {!pathDetailState || pathDetailState.kind === "loading" ? (
          <p className="settings-section-note">{strings.loadingPath}</p>
        ) : pathDetailState.kind === "error" ? (
          <GuestNotice message={pathDetailState.text} />
        ) : !pathDetailState.data ? (
          <GuestNotice message={strings.pathUnavailable} />
        ) : (
          renderPathDetail(pathDetailState.data)
        )}
      </>
    );
  }

  function renderCollection(collectionId: string) {
    const collection =
      collectionsState.kind === "loaded" ? collectionsState.data.find(c => c.id === collectionId) : undefined;

    return (
      <>
        <div className="notes-card-actions">
          <button type="button" className="text-link" onClick={() => setView({ kind: "index" })}>
            {strings.backToCanon}
          </button>
        </div>
        {collection && (
          <>
            <h3 className="plan-card-name">{resolveCanonText(collection.title, collection.titleI18n, locale)}</h3>
            {collection.description && (
              <p className="settings-section-note">
                {resolveCanonText(collection.description, collection.descriptionI18n, locale)}
              </p>
            )}
          </>
        )}
        {!pathsState || pathsState.kind === "loading" ? (
          <p className="settings-section-note">{strings.loadingCollectionPaths}</p>
        ) : pathsState.kind === "error" ? (
          <GuestNotice message={pathsState.text} />
        ) : pathsState.data.length === 0 ? (
          <GuestNotice message={strings.emptyCollectionPaths} />
        ) : (
          <div className="notes-group-items">
            {pathsState.data.map(path => (
              <article key={path.id} className="notes-card">
                <h3 className="plan-card-name">{resolveCanonText(path.title, path.titleI18n, locale)}</h3>
                {path.description && (
                  <p className="settings-section-note">
                    {resolveCanonText(path.description, path.descriptionI18n, locale)}
                  </p>
                )}
                <div className="notes-card-actions">
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setView({ kind: "path", pathId: path.id, originCollectionId: collectionId })}
                  >
                    {strings.openPath}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </>
    );
  }

  function renderIndex() {
    if (collectionsState.kind === "loading") {
      return <p className="settings-section-note">{strings.loadingIndex}</p>;
    }
    if (collectionsState.kind === "error") {
      return <GuestNotice message={collectionsState.text} />;
    }
    if (collectionsState.data.length === 0) {
      return <GuestNotice message={strings.emptyIndex} />;
    }
    return (
      <div className="notes-group-items">
        {collectionsState.data.map(collection => (
          <article key={collection.id} className="notes-card">
            <h3 className="plan-card-name">{resolveCanonText(collection.title, collection.titleI18n, locale)}</h3>
            {collection.description && (
              <p className="settings-section-note">
                {resolveCanonText(collection.description, collection.descriptionI18n, locale)}
              </p>
            )}
            <p className="notes-card-edition">{strings.pathCount(collection.publishedPathCount)}</p>
            <div className="notes-card-actions">
              <button
                type="button"
                className="text-link"
                onClick={() => setView({ kind: "collection", collectionId: collection.id })}
              >
                {strings.open}
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <section className="notes-group" aria-label="The Canon">
      <header className="notes-group-header">
        <div>
          <p className="eyebrow">The Canon</p>
          <h2 className="notes-group-title">THE CANON</h2>
          <p className="notes-group-author">{strings.subtitle}</p>
        </div>
      </header>

      {view.kind === "index" && renderIndex()}
      {view.kind === "collection" && renderCollection(view.collectionId)}
      {view.kind === "path" && renderPath(view.originCollectionId)}
    </section>
  );
}
