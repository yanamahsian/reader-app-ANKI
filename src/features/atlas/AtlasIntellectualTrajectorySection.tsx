import { useEffect, useMemo, useRef, useState } from "react";
import {
  listAtlasSemanticConcepts,
  listAtlasSemanticEvidence,
  type AtlasSemanticConcept,
  type AtlasSemanticEvidence
} from "../../api/atlasSemantic";
import type { Annotation } from "../../api/annotations";
import { listThoughtThreads, type ThoughtThread } from "../../api/thoughtThreads";
import { getBookById } from "../../catalog";
import { GuestNotice } from "../shared/GuestNotice";

interface AtlasIntellectualTrajectorySectionProps {
  annotationById: Map<string, Annotation>;
  unavailableAnnotationId: string | null;
  onOpenAnnotation: (annotation: Annotation) => void;
}

interface TrajectoryPoint {
  key: string;
  occurredAt: string;
  evidence: AtlasSemanticEvidence;
  sourceType: "annotation" | "thread";
  annotation: Annotation | null;
  thread: ThoughtThread | null;
  workIds: string[];
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

function sourceForm(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "источник";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "источника";
  return "источников";
}

function bookForm(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "книга";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "книги";
  return "книг";
}

export function AtlasIntellectualTrajectorySection({
  annotationById,
  unavailableAnnotationId,
  onOpenAnnotation
}: AtlasIntellectualTrajectorySectionProps) {
  const [concepts, setConcepts] = useState<AtlasSemanticConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<AtlasSemanticEvidence[]>([]);
  const [threadById, setThreadById] = useState<Map<string, ThoughtThread>>(new Map());
  const [trajectoryLoading, setTrajectoryLoading] = useState(false);
  const [trajectoryError, setTrajectoryError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void listAtlasSemanticConcepts()
      .then(rows => {
        if (cancelled) return;
        setConcepts(rows);
        setLoadError(null);
      })
      .catch(error => {
        console.error("Atlas intellectual trajectory concept load failed:", error);
        if (!cancelled) setLoadError("Не удалось загрузить концепты для интеллектуальной траектории.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      requestId.current += 1;
    };
  }, []);

  const topConcepts = useMemo(() => {
    return [...concepts]
      .filter(concept => concept.entityType === "concept")
      .sort((left, right) =>
        right.sourceCount - left.sourceCount ||
        right.workCount - left.workCount ||
        right.evidenceCount - left.evidenceCount ||
        left.labelRu.localeCompare(right.labelRu, "ru")
      )
      .slice(0, 12);
  }, [concepts]);

  const selectedConcept = selectedConceptId
    ? concepts.find(concept => concept.id === selectedConceptId) ?? null
    : null;

  const points = useMemo<TrajectoryPoint[]>(() => {
    const result: TrajectoryPoint[] = [];

    for (const item of evidence) {
      if (item.sourceType === "annotation") {
        const annotation = annotationById.get(item.sourceId) ?? null;
        if (!annotation) continue;
        result.push({
          key: `annotation:${item.id}`,
          occurredAt: annotation.createdAt,
          evidence: item,
          sourceType: "annotation",
          annotation,
          thread: null,
          workIds: [annotation.workId]
        });
        continue;
      }

      const thread = threadById.get(item.sourceId) ?? null;
      if (!thread) continue;
      const workIds = Array.from(new Set(
        thread.annotationIds
          .map(id => annotationById.get(id)?.workId ?? null)
          .filter((workId): workId is string => Boolean(workId))
      ));
      result.push({
        key: `thread:${item.id}`,
        occurredAt: thread.createdAt,
        evidence: item,
        sourceType: "thread",
        annotation: null,
        thread,
        workIds
      });
    }

    return result.sort((left, right) =>
      new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
    );
  }, [annotationById, evidence, threadById]);

  const trajectoryWorkIds = useMemo(
    () => Array.from(new Set(points.flatMap(point => point.workIds))),
    [points]
  );

  const unavailableEvidenceCount = Math.max(0, evidence.length - points.length);

  async function toggleTrajectory(concept: AtlasSemanticConcept): Promise<void> {
    if (selectedConceptId === concept.id) {
      requestId.current += 1;
      setSelectedConceptId(null);
      setEvidence([]);
      setThreadById(new Map());
      setTrajectoryError(null);
      setTrajectoryLoading(false);
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setSelectedConceptId(concept.id);
    setEvidence([]);
    setThreadById(new Map());
    setTrajectoryError(null);
    setTrajectoryLoading(true);

    try {
      const rows = await listAtlasSemanticEvidence(concept.id);
      const needsThreads = rows.some(item => item.sourceType === "thread");
      const threads = needsThreads ? await listThoughtThreads() : [];
      if (requestId.current !== currentRequest) return;
      setEvidence(rows);
      setThreadById(new Map(threads.map(thread => [thread.id, thread])));
    } catch (error) {
      console.error("Atlas intellectual trajectory load failed:", error);
      if (requestId.current === currentRequest) {
        setTrajectoryError("Не удалось построить интеллектуальную траекторию этого концепта.");
      }
    } finally {
      if (requestId.current === currentRequest) setTrajectoryLoading(false);
    }
  }

  return (
    <section className="notes-group" aria-label="Интеллектуальная траектория Atlas">
      <header className="notes-group-header">
        <div>
          <p className="eyebrow">Intellectual Trajectory</p>
          <h2 className="notes-group-title">Как идеи возвращаются через чтение</h2>
          <p className="notes-group-author">
            Atlas раскладывает выбранный концепт по реальной хронологии ваших цитат, заметок и Thought Threads. Для даты используется момент создания исходной заметки или нити — не время AI-индексации.
          </p>
        </div>
      </header>

      {loading ? (
        <GuestNotice message="Загружаем интеллектуальные траектории…" />
      ) : loadError ? (
        <GuestNotice message={loadError} />
      ) : topConcepts.length === 0 ? (
        <GuestNotice message="Траектории появятся, когда Semantic Memory накопит хотя бы один содержательный концепт." />
      ) : (
        <div className="notes-group-items">
          {topConcepts.map(concept => {
            const expanded = selectedConceptId === concept.id;
            return (
              <article key={concept.id} className="notes-card">
                <p className="eyebrow">Concept</p>
                <h3 className="plan-card-name">{concept.labelRu}</h3>
                <p className="settings-section-note">
                  {concept.sourceCount} {sourceForm(concept.sourceCount)}
                  {concept.workCount > 0 ? ` · ${concept.workCount} ${bookForm(concept.workCount)}` : ""}
                </p>
                <div className="notes-card-actions">
                  <button
                    type="button"
                    className="text-link"
                    aria-expanded={expanded}
                    onClick={() => void toggleTrajectory(concept)}
                  >
                    {expanded ? "Скрыть траекторию" : "Показать траекторию"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedConcept && (
        <section className="notes-group" aria-label={`Траектория концепта ${selectedConcept.labelRu}`}>
          <header className="notes-group-header">
            <div>
              <p className="eyebrow">Trajectory</p>
              <h3 className="notes-group-title">«{selectedConcept.labelRu}» во времени</h3>
              {!trajectoryLoading && !trajectoryError && points.length > 0 && (
                <p className="notes-group-author">
                  {points.length === 1
                    ? "Пока одна точка — это ещё не траектория, а начало будущей линии."
                    : `${formatDate(points[0].occurredAt)} → ${formatDate(points[points.length - 1].occurredAt)} · ${trajectoryWorkIds.length} ${bookForm(trajectoryWorkIds.length)}.`}
                </p>
              )}
            </div>
          </header>

          {trajectoryLoading ? (
            <GuestNotice message="Собираем хронологию исходных мыслей…" />
          ) : trajectoryError ? (
            <GuestNotice message={trajectoryError} />
          ) : points.length === 0 ? (
            <GuestNotice message="Сохранённые semantic evidence есть, но исходные заметки или нити больше не доступны. Atlas не подменяет их временем индексации." />
          ) : (
            <div className="notes-group-items">
              {points.map((point, index) => {
                const primaryWorkId = point.workIds[0] ?? point.evidence.workId;
                const book = primaryWorkId ? getBookById(primaryWorkId) : null;
                const annotation = point.annotation;
                const thread = point.thread;

                return (
                  <article key={point.key} className="notes-card">
                    <p className="eyebrow">Точка {index + 1} · {formatDate(point.occurredAt)}</p>
                    {book && (
                      <p className="notes-card-edition">
                        {book.title}{book.authorName ? ` · ${book.authorName}` : ""}
                      </p>
                    )}

                    {annotation && (
                      <>
                        <blockquote className="notes-card-quote">{annotation.quoteText}</blockquote>
                        {annotation.noteText && <p className="notes-card-note">{annotation.noteText}</p>}
                      </>
                    )}

                    {thread && (
                      <>
                        <h3 className="plan-card-name">{thread.title}</h3>
                        {thread.question && (
                          <p className="settings-section-note"><strong>Вопрос:</strong> {thread.question}</p>
                        )}
                        {thread.synthesisNote && <p className="notes-card-note">{thread.synthesisNote}</p>}
                      </>
                    )}

                    {point.evidence.excerpt && (
                      <p className="settings-section-note">
                        <strong>Почему Atlas видит здесь концепт:</strong> {point.evidence.excerpt}
                      </p>
                    )}

                    {thread && point.workIds.length > 1 && (
                      <p className="settings-section-note">
                        Эта нить связывает {point.workIds.length} {bookForm(point.workIds.length)}.
                      </p>
                    )}

                    {annotation && (
                      <div className="notes-card-actions">
                        <button type="button" className="text-link" onClick={() => onOpenAnnotation(annotation)}>
                          Вернуться к точному фрагменту
                        </button>
                      </div>
                    )}

                    {annotation && unavailableAnnotationId === annotation.id && (
                      <p className="book-detail-unavailable">Это издание сейчас недоступно в вашей юрисдикции.</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {unavailableEvidenceCount > 0 && (
            <p className="settings-section-note">
              Ещё {unavailableEvidenceCount} semantic evidence не показаны в хронологии: исходный объект уже недоступен. Их `sourceRevisionAt` намеренно не используется как дата чтения.
            </p>
          )}
        </section>
      )}

      <p className="settings-section-note">
        Просмотр траектории AI не вызывает: используются уже сохранённые semantic evidence и реальные даты исходных заметок/нитей.
      </p>
    </section>
  );
}
