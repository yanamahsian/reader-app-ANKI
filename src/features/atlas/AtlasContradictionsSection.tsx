// ATLAS CONTRADICTIONS v1: "Противоречия" -- a bounded, on-demand search
// for genuine intellectual disagreements between pairs of the visitor's
// own saved reading fragments. Not a chat, not a separate page, not an
// automatic encyclopedia (spec section 2): one explicit action in, a small
// curated set of grounded contradiction cards out, nothing persisted.
//
// Evidence reopen reuses the SAME exact-annotation Reader flow every other
// Atlas surface already uses (resolveEditionFile -> toReaderBook) via the
// boolean-returning resolver passed in from AtlasView -- no second
// Reader-opening mechanism here, same pattern as AtlasQuestionsSection.
import { useState } from "react";
import type { Annotation } from "../../api/annotations";
import {
  findAtlasContradictions,
  AtlasSessionExpiredError,
  type AtlasContradiction,
  type AtlasContradictionEvidence
} from "../../api/atlasContradictions";
import { getBookById } from "../../catalog";
import { GuestNotice } from "../shared/GuestNotice";

interface AtlasContradictionsSectionProps {
  annotationCount: number;
  annotationById: Map<string, Annotation>;
  onOpenAnnotationInReader: (annotation: Annotation) => boolean;
}

type FindState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; contradictions: AtlasContradiction[] }
  | { kind: "message"; text: string }
  | { kind: "error"; text: string };

const RELATION_LABELS: Record<AtlasContradiction["relation"], string> = {
  direct_contradiction: "Прямое противоречие",
  opposing_emphasis: "Разная расстановка акцентов",
  competing_interpretation: "Конкурирующая интерпретация"
};

export function AtlasContradictionsSection({
  annotationCount,
  annotationById,
  onOpenAnnotationInReader
}: AtlasContradictionsSectionProps) {
  const [state, setState] = useState<FindState>({ kind: "idle" });
  const [unavailableId, setUnavailableId] = useState<string | null>(null);

  async function handleFind(): Promise<void> {
    setState({ kind: "loading" });
    setUnavailableId(null);

    try {
      const result = await findAtlasContradictions();

      if (result.status === "ok" && result.contradictions.length > 0) {
        setState({ kind: "found", contradictions: result.contradictions });
        return;
      }

      setState({
        kind: "message",
        text: result.message || "В сохранённой памяти пока не найдено достаточно уверенных противоречий."
      });
    } catch (error) {
      if (error instanceof AtlasSessionExpiredError) {
        setState({ kind: "error", text: "Похоже, истекла сессия. Обновите страницу и войдите снова." });
        return;
      }
      console.error("findAtlasContradictions failed:", error);
      setState({
        kind: "error",
        text: error instanceof Error ? error.message : "Не удалось получить ответ от Atlas."
      });
    }
  }

  function handleOpenEvidence(evidence: AtlasContradictionEvidence): void {
    const annotation = annotationById.get(evidence.annotationId);
    if (!annotation) {
      setUnavailableId(evidence.annotationId);
      return;
    }
    setUnavailableId(onOpenAnnotationInReader(annotation) ? null : evidence.annotationId);
  }

  function renderEvidenceCard(evidence: AtlasContradictionEvidence) {
    const annotation = annotationById.get(evidence.annotationId);
    const book = annotation ? getBookById(annotation.workId) : null;
    return (
      <div className="notes-card">
        <p className="notes-card-edition">
          {book?.title ?? evidence.bookTitle ?? "Книга больше не найдена"}
          {(book?.authorName ?? evidence.author) ? ` · ${book?.authorName ?? evidence.author}` : ""}
        </p>
        <blockquote className="notes-card-quote">
          {annotation?.quoteText ?? evidence.quotePreview}
        </blockquote>
        <div className="notes-card-actions">
          <button type="button" className="text-link" onClick={() => handleOpenEvidence(evidence)}>
            Открыть точное место
          </button>
        </div>
        {unavailableId === evidence.annotationId && (
          <p className="book-detail-unavailable">Это издание сейчас недоступно в вашей юрисдикции.</p>
        )}
      </div>
    );
  }

  const isLoading = state.kind === "loading";

  return (
    <section className="notes-group" aria-label="Противоречия">
      <header className="notes-group-header">
        <div>
          <p className="eyebrow">Atlas Contradictions</p>
          <h2 className="notes-group-title">Противоречия</h2>
          <p className="notes-group-author">
            Ищем содержательные расхождения между вашими собственными сохранёнными фрагментами и заметками -- не сходство тем, а реальную несовместимость позиций.
          </p>
        </div>
      </header>

      {annotationCount < 2 ? (
        <GuestNotice message="Сначала сохраните хотя бы два фрагмента во время чтения -- тогда можно будет искать противоречия между ними." />
      ) : (
        <>
          <div className="notes-card-actions">
            <button type="button" className="primary-button" disabled={isLoading} onClick={() => void handleFind()}>
              {isLoading ? "Ищем расхождения…" : "Найти противоречия"}
            </button>
          </div>

          {state.kind === "error" && <p className="notes-card-error">{state.text}</p>}

          {state.kind === "message" && (
            <article className="notes-card">
              <p className="settings-section-note">{state.text}</p>
            </article>
          )}

          {state.kind === "found" && (
            <div className="notes-group-items">
              {state.contradictions.map((contradiction, index) => (
                <article
                  key={`${contradiction.evidenceA.annotationId}-${contradiction.evidenceB.annotationId}-${index}`}
                  className="notes-card"
                >
                  <p className="eyebrow">{RELATION_LABELS[contradiction.relation]}</p>

                  {renderEvidenceCard(contradiction.evidenceA)}
                  <p className="settings-section-note" aria-hidden="true">↕</p>
                  {renderEvidenceCard(contradiction.evidenceB)}

                  <p className="notes-card-note">{contradiction.synthesis}</p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
