import type { AtlasMemorySignal } from "../../api/atlasMemory";
import type { Annotation } from "../../api/annotations";
import { getBookById } from "../../catalog";
import { GuestNotice } from "../shared/GuestNotice";
import { AtlasConceptGraphSection } from "./AtlasConceptGraphSection";

interface AtlasPersistentMemorySectionProps {
  signals: AtlasMemorySignal[];
  annotationById: Map<string, Annotation>;
  unavailableAnnotationId: string | null;
  onOpenBookDetail: (workId: string) => void;
  onOpenAnnotation: (annotation: Annotation) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return "";
  }
}

function payloadString(signal: AtlasMemorySignal, key: string): string | null {
  const value = signal.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function libraryStatusLabel(status: string | null): string {
  switch (status) {
    case "reading":
      return "Чтение начато";
    case "finished":
      return "Книга завершена";
    case "want_to_read":
      return "Добавлено в «Хочу прочитать»";
    default:
      return "Библиотека обновлена";
  }
}

function signalEyebrow(signal: AtlasMemorySignal): string {
  switch (signal.signalType) {
    case "progress":
      return "Reading";
    case "bookmark":
      return "Bookmark";
    case "highlight":
      return "Highlight";
    case "note":
      return "Note";
    case "thread":
      return "Thought Thread";
    case "library":
      return "Library";
    case "thread_evidence":
      return "Thread Evidence";
  }
}

function signalSummary(signal: AtlasMemorySignal): string | null {
  const page = signal.pageIndex === null ? null : signal.pageIndex + 1;

  switch (signal.signalType) {
    case "progress":
      return page === null ? "Чтение продолжено" : `Чтение продолжено · стр. ${page}`;
    case "bookmark": {
      const chapter = signal.label?.trim();
      if (chapter && page !== null) return `Закладка · ${chapter} · стр. ${page}`;
      if (chapter) return `Закладка · ${chapter}`;
      return page === null ? "Закладка" : `Закладка · стр. ${page}`;
    }
    case "library":
      return libraryStatusLabel(payloadString(signal, "status"));
    case "highlight":
      return "Сохранённый фрагмент";
    case "note":
      return "Сохранённый фрагмент с заметкой";
    case "thread":
      return signal.label?.trim() || "Нить мысли";
    case "thread_evidence":
      return "Фрагмент добавлен в нить мысли";
  }
}

export function isVisibleAtlasMemorySignal(signal: AtlasMemorySignal): boolean {
  if (signal.signalType === "thread_evidence") return false;
  if (signal.signalType === "library" && payloadString(signal, "status") === "want_to_read") return false;
  return true;
}

export function AtlasPersistentMemorySection({
  signals,
  annotationById,
  unavailableAnnotationId,
  onOpenBookDetail,
  onOpenAnnotation
}: AtlasPersistentMemorySectionProps) {
  const visible = signals.filter(isVisibleAtlasMemorySignal);
  const recent = visible.slice(0, 20);

  return (
    <>
      <header className="notes-group-header">
        <div>
          <p className="eyebrow">Memory</p>
          <h2 className="notes-group-title">Постоянная память чтения</h2>
          <p className="notes-group-author">
            Реальные сигналы чтения сохраняются в аккаунте: прогресс, закладки, фрагменты, заметки, завершённые книги и нити мысли.
          </p>
        </div>
      </header>

      {recent.length === 0 ? (
        <GuestNotice message="Память Atlas пока пуста. Начните читать книгу, поставьте закладку или сохраните фрагмент — первый сигнал появится здесь автоматически." />
      ) : (
        <div className="notes-group-items">
          {recent.map(signal => {
            const book = signal.workId ? getBookById(signal.workId) : null;
            const annotation = signal.sourceType === "annotations"
              ? annotationById.get(signal.sourceId) ?? null
              : null;
            const summary = signalSummary(signal);
            const isThread = signal.signalType === "thread";
            const isPassage = signal.signalType === "highlight" || signal.signalType === "note";

            return (
              <article key={signal.id} className="notes-card">
                <p className="eyebrow">{signalEyebrow(signal)}</p>

                {book && (
                  <p className="notes-card-edition">
                    {book.title}{book.authorName ? ` · ${book.authorName}` : ""}
                  </p>
                )}

                {isThread && signal.label && <h3 className="plan-card-name">{signal.label}</h3>}
                {summary && !isThread && <p className="settings-section-note">{summary}</p>}

                {isPassage && signal.excerpt && (
                  <blockquote className="notes-card-quote">{signal.excerpt}</blockquote>
                )}

                {isThread && signal.excerpt && (
                  <p className="settings-section-note"><strong>Вопрос:</strong> {signal.excerpt}</p>
                )}

                {signal.noteText && <p className="notes-card-note">{signal.noteText}</p>}

                <div className="notes-card-actions">
                  {book && signal.workId && (
                    <button type="button" className="text-link" onClick={() => onOpenBookDetail(signal.workId!)}>
                      Открыть книгу
                    </button>
                  )}
                  {annotation && (
                    <button type="button" className="text-link" onClick={() => onOpenAnnotation(annotation)}>
                      Вернуться к фрагменту
                    </button>
                  )}
                </div>

                {annotation && unavailableAnnotationId === annotation.id && (
                  <p className="book-detail-unavailable">
                    Это издание сейчас недоступно в вашей юрисдикции.
                  </p>
                )}

                <p className="notes-card-date">{formatDate(signal.occurredAt)}</p>
              </article>
            );
          })}
        </div>
      )}

      {visible.length > recent.length && (
        <p className="settings-section-note">
          В постоянной памяти сейчас {visible.length} сигналов. Здесь показаны последние {recent.length}; полная история остаётся в аккаунте и доступна Atlas как источник дальнейшей интеллектуальной памяти.
        </p>
      )}

      <AtlasConceptGraphSection
        annotationById={annotationById}
        unavailableAnnotationId={unavailableAnnotationId}
        onOpenAnnotation={onOpenAnnotation}
      />
    </>
  );
}
