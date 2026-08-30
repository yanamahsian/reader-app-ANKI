// ATLAS UNFINISHED LINES OF THOUGHT v1: "Незавершённые линии" -- a bounded,
// on-demand search for new reading that may genuinely continue one of the
// visitor's own unresolved Thought Threads (an explicit open question, no
// synthesis yet). Not automatic, not a background notification: one
// explicit action in, a small curated set of grounded dual-evidence cards
// out, nothing persisted here.
//
// Evidence reopen reuses the SAME exact-annotation Reader flow every other
// Atlas surface already uses (resolveEditionFile -> toReaderBook) via the
// boolean-returning resolver passed in from AtlasView -- no second
// Reader-opening mechanism here, same pattern as AtlasQuestionsSection and
// AtlasContradictionsSection.
//
// FINAL INTEGRATION CORRECTION: "Добавить в нить" now writes through
// appendAnnotationToThoughtThread() (src/api/thoughtThreads.ts) -- the
// SAME atomic, row-locked, idempotent single-annotation append RPC Reader's
// own Thread picker uses (append_annotation_to_thought_thread) -- NOT
// replaceThoughtThread(). v1's original draft used replaceThoughtThread()
// here, which predates both the append RPC and Optimistic Concurrency
// Control: it read the Thread's current annotationIds, appended one id
// client-side, and wrote the WHOLE array back via a full replace. Once OCC
// shipped, that shape would have needed an expectedUpdatedAt this
// component never had a reason to track, and even before OCC it re-created
// exactly the TOCTOU/lost-update window threadBridge.ts's own correction
// pass already closed for Reader's append path (see that file's comment).
// Reusing the existing atomic append here instead of inventing a second
// one is what actually closes it for this entry point too.
//
// That append is also v1's entire "acknowledgment" mechanism: a
// successful append advances the Thread's own updated_at past the newly
// added annotation's created_at, which is exactly the temporal gate
// omnia-ai's atlas-unfinished-lines action itself uses, so the same
// annotation stops qualifying as "new" for this Thread on a later run --
// no dismissed/seen state, no new table. It is also, unmodified, the exact
// signal Thought Thread Optimistic Concurrency v1 depends on: if an old
// full Thread editor is open elsewhere with a now-stale expectedUpdatedAt,
// its next Save is rejected with a conflict rather than silently
// overwriting what this action just added -- see AtlasView's own OCC
// comments for the full mechanism this component deliberately does not
// need to know anything about.
import { useState } from "react";
import type { Annotation } from "../../api/annotations";
import type { ThoughtThread } from "../../api/thoughtThreads";
import { appendAnnotationToThoughtThread, ThoughtThreadAppendError } from "../../api/thoughtThreads";
import {
  findAtlasUnfinishedLines,
  AtlasSessionExpiredError,
  type AtlasUnfinishedLine,
  type AtlasUnfinishedLineEvidence
} from "../../api/atlasUnfinishedLines";
import { getBookById } from "../../catalog";
import { GuestNotice } from "../shared/GuestNotice";

interface AtlasUnfinishedLinesSectionProps {
  threads: ThoughtThread[];
  annotationById: Map<string, Annotation>;
  onOpenAnnotationInReader: (annotation: Annotation) => boolean;
  onThreadUpdated: () => Promise<void>;
}

type FindState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; lines: AtlasUnfinishedLine[] }
  | { kind: "message"; text: string } // honest "nothing to search over" / "nothing found" from the server
  | { kind: "error"; text: string };

type AddState = "idle" | "adding" | "added" | "error";

const RELATION_LABELS: Record<AtlasUnfinishedLine["relation"], string> = {
  extends: "Продолжает мысль",
  complicates: "Усложняет вопрос",
  challenges: "Бросает вызов",
  partially_answers: "Частично отвечает",
  reframes: "Переосмысляет вопрос"
};

function lineKey(line: AtlasUnfinishedLine): string {
  return `${line.threadId}-${line.newEvidence.annotationId}`;
}

// Maps appendAnnotationToThoughtThread()'s stable error kind onto the same
// user-facing Russian copy AtlasView's own Thread editor already uses for
// the equivalent cases, so a visitor sees consistent language regardless
// of which surface the write happened from.
function addErrorMessage(error: unknown): string {
  if (error instanceof ThoughtThreadAppendError) {
    switch (error.kind) {
      case "not_authenticated":
        return "Сессия истекла. Войдите снова, чтобы добавить фрагмент в нить.";
      case "thread_unavailable":
        return "Эта нить мысли больше не существует.";
      case "annotation_unavailable":
        return "Этот фрагмент больше недоступен.";
      case "generic":
        return "Не удалось добавить фрагмент в нить. Попробуйте ещё раз.";
    }
  }
  return "Не удалось добавить фрагмент в нить. Попробуйте ещё раз.";
}

export function AtlasUnfinishedLinesSection({
  threads,
  annotationById,
  onOpenAnnotationInReader,
  onThreadUpdated
}: AtlasUnfinishedLinesSectionProps) {
  const [state, setState] = useState<FindState>({ kind: "idle" });
  const [unavailableId, setUnavailableId] = useState<string | null>(null);
  const [addState, setAddState] = useState<Record<string, AddState>>({});
  const [addError, setAddError] = useState<Record<string, string>>({});

  async function handleFind(): Promise<void> {
    setState({ kind: "loading" });
    setUnavailableId(null);
    setAddState({});
    setAddError({});

    try {
      const result = await findAtlasUnfinishedLines();

      if (result.status === "ok" && result.lines.length > 0) {
        setState({ kind: "found", lines: result.lines });
        return;
      }

      // Both "no_memory" and "insufficient_material" land here as an
      // honest message, never as a thrown exception -- the AI was either
      // never invoked (no unresolved thread to look at) or was invoked and
      // genuinely found nothing precise enough to show.
      setState({
        kind: "message",
        text: result.message || "Пока не найдено новых фрагментов, которые продолжали бы одну из открытых нитей мысли."
      });
    } catch (error) {
      if (error instanceof AtlasSessionExpiredError) {
        setState({ kind: "error", text: "Похоже, истекла сессия. Обновите страницу и войдите снова." });
        return;
      }
      console.error("findAtlasUnfinishedLines failed:", error);
      setState({
        kind: "error",
        text: error instanceof Error ? error.message : "Не удалось получить ответ от Atlas."
      });
    }
  }

  function handleOpenEvidence(evidence: AtlasUnfinishedLineEvidence): void {
    const annotation = annotationById.get(evidence.annotationId);
    if (!annotation) {
      setUnavailableId(evidence.annotationId);
      return;
    }
    setUnavailableId(onOpenAnnotationInReader(annotation) ? null : evidence.annotationId);
  }

  async function handleAddToThread(line: AtlasUnfinishedLine): Promise<void> {
    const key = lineKey(line);

    setAddState(current => ({ ...current, [key]: "adding" }));
    setAddError(current => ({ ...current, [key]: "" }));

    try {
      // Atomic single-annotation append -- row-locked, idempotent, ownership-
      // checked server-side. Never assembles [oldIds..., newId] on the
      // client and never sends it through replaceThoughtThread(): this is
      // the same write Reader's own Thought Thread picker uses, and it is
      // the ONLY write this component performs.
      await appendAnnotationToThoughtThread(line.threadId, line.newEvidence.annotationId);
      // Success is shown only after a confirmed server write and a fresh
      // RLS-backed read of Thought Threads -- same discipline as the
      // Thought Threads composer itself (AtlasView.handleSaveThread).
      await onThreadUpdated();
      setAddState(current => ({ ...current, [key]: "added" }));
    } catch (error) {
      console.error("Atlas Unfinished Lines: add to thread failed:", error);
      setAddState(current => ({ ...current, [key]: "error" }));
      setAddError(current => ({ ...current, [key]: addErrorMessage(error) }));
    }
  }

  function renderEvidenceCard(evidence: AtlasUnfinishedLineEvidence) {
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
    <section className="notes-group" aria-label="Незавершённые линии мысли">
      <header className="notes-group-header">
        <div>
          <p className="eyebrow">Atlas Unfinished Lines</p>
          <h2 className="notes-group-title">Незавершённые линии</h2>
          <p className="notes-group-author">
            Ищем среди недавно сохранённого новое чтение, которое может продолжить, усложнить или бросить вызов открытому вопросу в одной из ваших нитей мысли -- не просто совпадение темы, а содержательное продолжение.
          </p>
        </div>
      </header>

      {threads.length === 0 ? (
        <GuestNotice message="Сначала создайте нить мысли с открытым вопросом -- тогда Atlas сможет заметить, когда новое чтение продолжит его." />
      ) : (
        <>
          <div className="notes-card-actions">
            <button type="button" className="primary-button" disabled={isLoading} onClick={() => void handleFind()}>
              {isLoading ? "Ищем продолжения…" : "Найти незавершённые линии"}
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
              {state.lines.map(line => {
                const key = lineKey(line);
                const status = addState[key] ?? "idle";
                return (
                  <article key={key} className="notes-card">
                    <p className="eyebrow">{RELATION_LABELS[line.relation]}</p>
                    <h3 className="plan-card-name">{line.threadTitle}</h3>
                    {line.threadQuestion && (
                      <p className="settings-section-note"><strong>Открытый вопрос:</strong> {line.threadQuestion}</p>
                    )}

                    <p className="settings-section-note" aria-hidden="true">Ранее в нити</p>
                    {line.oldEvidence.map(evidence => (
                      <div key={evidence.annotationId}>{renderEvidenceCard(evidence)}</div>
                    ))}

                    <p className="settings-section-note" aria-hidden="true">↓ Новое чтение</p>
                    {renderEvidenceCard(line.newEvidence)}

                    <p className="notes-card-note">{line.synthesis}</p>

                    <div className="notes-card-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={status === "adding" || status === "added"}
                        onClick={() => void handleAddToThread(line)}
                      >
                        {status === "adding" ? "Добавляем…" : status === "added" ? "Добавлено в нить" : "Добавить в нить"}
                      </button>
                    </div>
                    {status === "error" && (
                      <p className="notes-card-error">{addError[key] || "Не удалось добавить фрагмент в нить. Попробуйте ещё раз."}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
