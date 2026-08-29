// ATLAS CROSS-BOOK QUESTIONS v1: "Спросить свой Atlas" -- a bounded
// question over the visitor's own already-loaded Reading Memory
// (annotations) and Thought Threads. Explicitly not a general chat box:
// one question in, one grounded answer with clickable evidence out, no
// conversation history kept anywhere (client or server).
//
// Evidence reopen reuses the SAME exact-annotation Reader flow every other
// Atlas surface already uses (resolveEditionFile -> toReaderBook ->
// onOpenAnnotationInReader) via the boolean-returning resolver passed in
// from AtlasView -- no second Reader-opening mechanism here.
import { useState } from "react";
import type { Annotation } from "../../api/annotations";
import { askAtlasQuestion, AtlasSessionExpiredError, type AtlasQuestionEvidence } from "../../api/atlasQuestions";
import { getBookById } from "../../catalog";
import { GuestNotice } from "../shared/GuestNotice";

interface AtlasQuestionsSectionProps {
  annotationCount: number;
  annotationById: Map<string, Annotation>;
  onOpenAnnotationInReader: (annotation: Annotation) => boolean;
}

type AskState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "answered"; answer: string; evidence: AtlasQuestionEvidence[] }
  | { kind: "message"; text: string } // honest "not enough material" / "no memory" from the server
  | { kind: "error"; text: string };

const PLACEHOLDER_EXAMPLES = [
  "Как тема вины менялась в моём чтении?",
  "Что я сохранял о свободе?",
  "Где мои авторы противоречат друг другу?"
];

export function AtlasQuestionsSection({
  annotationCount,
  annotationById,
  onOpenAnnotationInReader
}: AtlasQuestionsSectionProps) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ kind: "idle" });
  const [unavailableId, setUnavailableId] = useState<string | null>(null);

  async function handleAsk(): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed) {
      setState({ kind: "error", text: "Введите вопрос." });
      return;
    }

    setState({ kind: "loading" });
    setUnavailableId(null);

    try {
      const result = await askAtlasQuestion(trimmed);

      if (result.status === "ok" && result.answer) {
        setState({ kind: "answered", answer: result.answer, evidence: result.evidence });
        return;
      }

      setState({
        kind: "message",
        text: result.message || "В вашей сохранённой памяти пока недостаточно материала, чтобы уверенно проследить эту тему."
      });
    } catch (error) {
      if (error instanceof AtlasSessionExpiredError) {
        setState({ kind: "error", text: "Похоже, истекла сессия. Обновите страницу и войдите снова." });
        return;
      }
      console.error("askAtlasQuestion failed:", error);
      setState({
        kind: "error",
        text: error instanceof Error ? error.message : "Не удалось получить ответ от Atlas."
      });
    }
  }

  function handleOpenEvidence(evidence: AtlasQuestionEvidence): void {
    const annotation = annotationById.get(evidence.annotationId);
    if (!annotation) {
      setUnavailableId(evidence.annotationId);
      return;
    }
    setUnavailableId(onOpenAnnotationInReader(annotation) ? null : evidence.annotationId);
  }

  const isLoading = state.kind === "loading";

  return (
    <section className="notes-group" aria-label="Спросить свой Atlas">
      <header className="notes-group-header">
        <div>
          <p className="eyebrow">Atlas Questions</p>
          <h2 className="notes-group-title">Спросить свой Atlas</h2>
          <p className="notes-group-author">
            Вопрос о вашем собственном прочитанном -- ответ строится на ваших сохранённых цитатах, заметках и нитях мысли, а не на общих рассуждениях.
          </p>
        </div>
      </header>

      {annotationCount === 0 ? (
        <GuestNotice message="Сначала сохраните несколько фрагментов во время чтения -- тогда можно будет задать вопрос своему Atlas." />
      ) : (
        <>
          <textarea
            className="annotation-note-input"
            value={question}
            maxLength={300}
            placeholder={PLACEHOLDER_EXAMPLES[0]}
            aria-label="Вопрос своему Atlas"
            disabled={isLoading}
            onChange={event => setQuestion(event.target.value)}
          />

          <p className="settings-section-note">
            Например: «{PLACEHOLDER_EXAMPLES[1]}» или «{PLACEHOLDER_EXAMPLES[2]}»
          </p>

          <div className="notes-card-actions">
            <button type="button" className="primary-button" disabled={isLoading} onClick={() => void handleAsk()}>
              {isLoading ? "Ищем в вашей памяти…" : "Спросить"}
            </button>
          </div>

          {state.kind === "error" && <p className="notes-card-error">{state.text}</p>}

          {state.kind === "message" && (
            <article className="notes-card">
              <p className="settings-section-note">{state.text}</p>
            </article>
          )}

          {state.kind === "answered" && (
            <article className="notes-card">
              <p className="eyebrow">Ответ Atlas</p>
              <p className="notes-card-note">{state.answer}</p>

              {state.evidence.length > 0 && (
                <div className="notes-group-items">
                  {state.evidence.map(evidence => {
                    const annotation = annotationById.get(evidence.annotationId);
                    const book = annotation ? getBookById(annotation.workId) : null;
                    return (
                      <div key={evidence.annotationId} className="notes-card">
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
                          <p className="book-detail-unavailable">
                            Это издание сейчас недоступно в вашей юрисдикции.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          )}
        </>
      )}
    </section>
  );
}
