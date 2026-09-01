import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtlasSemanticIndexError,
  listAtlasSemanticEvidence,
  loadAtlasSemanticGraph,
  runAtlasSemanticIndex,
  type AtlasSemanticConcept,
  type AtlasSemanticEvidence,
  type AtlasSemanticIndexResult,
  type AtlasSemanticRelationship
} from "../../api/atlasSemantic";
import type { Annotation } from "../../api/annotations";
import { listThoughtThreads, type ThoughtThread } from "../../api/thoughtThreads";
import { getBookById } from "../../catalog";
import { GuestNotice } from "../shared/GuestNotice";

interface SemanticGraphState {
  concepts: AtlasSemanticConcept[];
  relationships: AtlasSemanticRelationship[];
}

interface AtlasSemanticGraphSectionProps {
  annotationById: Map<string, Annotation>;
  unavailableAnnotationId: string | null;
  onOpenAnnotation: (annotation: Annotation) => void;
}

function entityTypeLabel(type: AtlasSemanticConcept["entityType"]): string {
  return type === "person" ? "Человек" : "Концепт";
}

function sourceForm(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "источник";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "источника";
  return "источников";
}

function evidenceForm(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "подтверждение";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "подтверждения";
  return "подтверждений";
}

function formatReset(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

function formatEvidenceDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

function confidenceLabel(value: number): string {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return `${Math.round(normalized * 100)}% уверенности`;
}

export function AtlasSemanticGraphSection({
  annotationById,
  unavailableAnnotationId,
  onOpenAnnotation
}: AtlasSemanticGraphSectionProps) {
  const [graph, setGraph] = useState<SemanticGraphState>({ concepts: [], relationships: [] });
  const [indexResult, setIndexResult] = useState<AtlasSemanticIndexResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<AtlasSemanticEvidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [threadById, setThreadById] = useState<Map<string, ThoughtThread>>(new Map());
  const evidenceRequest = useRef(0);

  async function refresh(runIndex: boolean, cancelled?: () => boolean): Promise<void> {
    if (runIndex) {
      setIndexing(true);
      setIndexMessage(null);
      try {
        const result = await runAtlasSemanticIndex();
        if (!cancelled?.()) setIndexResult(result);
      } catch (error) {
        if (!cancelled?.()) {
          if (error instanceof AtlasSemanticIndexError) {
            const reset = formatReset(error.resetAt);
            if (error.kind === "monthly_limit" || error.kind === "hourly_limit") {
              setIndexMessage(`${error.message}${reset ? ` Следующее окно: ${reset}.` : ""}`);
            } else if (error.kind !== "auth_required") {
              setIndexMessage(error.message);
            }
          } else {
            setIndexMessage("Новые фрагменты пока не удалось проиндексировать.");
          }
        }
      } finally {
        if (!cancelled?.()) setIndexing(false);
      }
    }

    try {
      const next = await loadAtlasSemanticGraph();
      if (!cancelled?.()) {
        setGraph(next);
        setLoadError(null);
      }
    } catch (error) {
      console.error("Atlas semantic graph load failed:", error);
      if (!cancelled?.()) setLoadError("Не удалось загрузить сохранённую смысловую карту Atlas.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void refresh(true, () => cancelled).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      evidenceRequest.current += 1;
    };
  }, []);

  const conceptById = useMemo(
    () => new Map(graph.concepts.map(concept => [concept.id, concept])),
    [graph.concepts]
  );

  const topConcepts = useMemo(() => {
    const recurring = graph.concepts.filter(concept => concept.sourceCount >= 2);
    const source = recurring.length >= 4 ? recurring : graph.concepts;
    return [...source]
      .sort((left, right) =>
        right.sourceCount - left.sourceCount ||
        right.evidenceCount - left.evidenceCount ||
        right.workCount - left.workCount ||
        left.labelRu.localeCompare(right.labelRu, "ru")
      )
      .slice(0, 18);
  }, [graph.concepts]);

  const topRelationships = useMemo(() => {
    const recurring = graph.relationships.filter(item => item.sharedSourceCount >= 2 || item.sharedWorkCount >= 2);
    const source = recurring.length ? recurring : graph.relationships;
    return source
      .filter(item => conceptById.has(item.leftConceptId) && conceptById.has(item.rightConceptId))
      .slice(0, 12);
  }, [graph.relationships, conceptById]);

  const selectedConcept = selectedConceptId ? conceptById.get(selectedConceptId) ?? null : null;
  const remaining = indexResult?.remaining ?? 0;

  async function toggleEvidence(concept: AtlasSemanticConcept): Promise<void> {
    if (selectedConceptId === concept.id) {
      evidenceRequest.current += 1;
      setSelectedConceptId(null);
      setSelectedEvidence([]);
      setThreadById(new Map());
      setEvidenceError(null);
      setEvidenceLoading(false);
      return;
    }

    const requestId = evidenceRequest.current + 1;
    evidenceRequest.current = requestId;
    setSelectedConceptId(concept.id);
    setSelectedEvidence([]);
    setThreadById(new Map());
    setEvidenceError(null);
    setEvidenceLoading(true);

    try {
      const evidence = await listAtlasSemanticEvidence(concept.id);
      let threads = new Map<string, ThoughtThread>();

      if (evidence.some(item => item.sourceType === "thread")) {
        const loadedThreads = await listThoughtThreads();
        threads = new Map(loadedThreads.map(thread => [thread.id, thread]));
      }

      if (evidenceRequest.current !== requestId) return;
      setSelectedEvidence(evidence);
      setThreadById(threads);
    } catch (error) {
      console.error("Atlas semantic evidence load failed:", error);
      if (evidenceRequest.current === requestId) {
        setEvidenceError("Не удалось загрузить доказательства этого смыслового узла.");
      }
    } finally {
      if (evidenceRequest.current === requestId) setEvidenceLoading(false);
    }
  }

  function renderAnnotationEvidence(evidence: AtlasSemanticEvidence) {
    const annotation = annotationById.get(evidence.sourceId) ?? null;
    const workId = annotation?.workId ?? evidence.workId;
    const book = workId ? getBookById(workId) : null;

    return (
      <article key={evidence.id} className="notes-card">
        <p className="eyebrow">Цитата / заметка</p>
        {book && (
          <p className="notes-card-edition">
            {book.title}{book.authorName ? ` · ${book.authorName}` : ""}
          </p>
        )}

        {annotation ? (
          <>
            <blockquote className="notes-card-quote">{annotation.quoteText}</blockquote>
            {annotation.noteText && <p className="notes-card-note">{annotation.noteText}</p>}
          </>
        ) : evidence.excerpt ? (
          <blockquote className="notes-card-quote">{evidence.excerpt}</blockquote>
        ) : (
          <p className="settings-section-note">Исходный фрагмент больше недоступен в локальной выборке Atlas.</p>
        )}

        {evidence.excerpt && annotation && (
          <p className="settings-section-note"><strong>Почему Atlas связал:</strong> {evidence.excerpt}</p>
        )}

        <p className="settings-section-note">
          {confidenceLabel(evidence.confidence)} · {formatEvidenceDate(evidence.sourceRevisionAt)}
        </p>

        {annotation && (
          <div className="notes-card-actions">
            <button type="button" className="text-link" onClick={() => onOpenAnnotation(annotation)}>
              Вернуться к точному фрагменту
            </button>
          </div>
        )}

        {annotation && unavailableAnnotationId === annotation.id && (
          <p className="book-detail-unavailable">
            Это издание сейчас недоступно в вашей юрисдикции.
          </p>
        )}
      </article>
    );
  }

  function renderThreadEvidence(evidence: AtlasSemanticEvidence) {
    const thread = threadById.get(evidence.sourceId) ?? null;
    const threadAnnotations = thread
      ? thread.annotationIds
          .map(id => annotationById.get(id))
          .filter((annotation): annotation is Annotation => Boolean(annotation))
      : [];

    return (
      <article key={evidence.id} className="notes-card">
        <p className="eyebrow">Thought Thread</p>
        <h3 className="plan-card-name">{thread?.title ?? "Нить мысли"}</h3>

        {thread?.question && (
          <p className="settings-section-note"><strong>Вопрос:</strong> {thread.question}</p>
        )}
        {thread?.synthesisNote && <p className="notes-card-note">{thread.synthesisNote}</p>}
        {evidence.excerpt && (
          <p className="settings-section-note"><strong>Почему Atlas связал:</strong> {evidence.excerpt}</p>
        )}

        <p className="settings-section-note">
          {confidenceLabel(evidence.confidence)} · {formatEvidenceDate(evidence.sourceRevisionAt)}
        </p>

        {threadAnnotations.length > 0 && (
          <div className="notes-group-items">
            {threadAnnotations.map(annotation => {
              const book = getBookById(annotation.workId);
              return (
                <div key={`${evidence.id}-${annotation.id}`} className="notes-card">
                  {book && (
                    <p className="notes-card-edition">
                      {book.title}{book.authorName ? ` · ${book.authorName}` : ""}
                    </p>
                  )}
                  <blockquote className="notes-card-quote">{annotation.quoteText}</blockquote>
                  {annotation.noteText && <p className="notes-card-note">{annotation.noteText}</p>}
                  <div className="notes-card-actions">
                    <button type="button" className="text-link" onClick={() => onOpenAnnotation(annotation)}>
                      Вернуться к точному фрагменту
                    </button>
                  </div>
                  {unavailableAnnotationId === annotation.id && (
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
    );
  }

  return (
    <div className="notes-group" aria-label="Смысловая карта Atlas">
      <header className="notes-group-header">
        <div>
          <p className="eyebrow">Semantic Memory</p>
          <h2 className="notes-group-title">Смысловая карта чтения</h2>
          <p className="notes-group-author">
            Atlas извлекает из ваших сохранённых цитат, заметок и Thought Threads повторяющиеся идеи и реально упомянутых людей. Каждый узел остаётся привязан к конкретной памяти чтения; AI используется для извлечения, а не для выдумывания биографии пользователя.
          </p>
        </div>
      </header>

      {loading ? (
        <GuestNotice message="Проверяем новые фрагменты и загружаем смысловую память Atlas…" />
      ) : loadError ? (
        <GuestNotice message={loadError} />
      ) : graph.concepts.length === 0 ? (
        <GuestNotice message="Смысловая карта появится после того, как в Reading Memory появятся содержательные цитаты, заметки или нити мысли. Пустые и слишком общие фрагменты Atlas намеренно не превращает в концепты." />
      ) : (
        <>
          <div className="subscription-blocks">
            <div className="subscription-block">
              <h2>{graph.concepts.length}</h2>
              <p className="settings-section-note">смысловых узлов</p>
            </div>
            <div className="subscription-block">
              <h2>{graph.concepts.filter(item => item.entityType === "concept").length}</h2>
              <p className="settings-section-note">концептов</p>
            </div>
            <div className="subscription-block">
              <h2>{graph.concepts.filter(item => item.entityType === "person").length}</h2>
              <p className="settings-section-note">людей</p>
            </div>
            <div className="subscription-block">
              <h2>{graph.relationships.length}</h2>
              <p className="settings-section-note">смысловых связей</p>
            </div>
          </div>

          <div className="notes-group-items">
            {topConcepts.map(concept => {
              const expanded = selectedConceptId === concept.id;
              const targetId = `atlas-semantic-evidence-${concept.id}`;
              return (
                <article key={concept.id} className="notes-card">
                  <p className="eyebrow">{entityTypeLabel(concept.entityType)}</p>
                  <h3 className="plan-card-name">{concept.labelRu}</h3>
                  <p className="settings-section-note">
                    {concept.sourceCount} {sourceForm(concept.sourceCount)} · {concept.evidenceCount} {evidenceForm(concept.evidenceCount)}
                    {concept.workCount > 0 ? ` · ${concept.workCount} книг` : ""}
                  </p>
                  <div className="notes-card-actions">
                    <button
                      type="button"
                      className="text-link"
                      aria-expanded={expanded}
                      aria-controls={targetId}
                      onClick={() => void toggleEvidence(concept)}
                    >
                      {expanded ? "Скрыть доказательства" : "Показать доказательства"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {selectedConcept && (
            <section
              id={`atlas-semantic-evidence-${selectedConcept.id}`}
              className="notes-group"
              aria-label={`Доказательства концепта ${selectedConcept.labelRu}`}
            >
              <header className="notes-group-header">
                <div>
                  <p className="eyebrow">Evidence</p>
                  <h3 className="notes-group-title">Почему «{selectedConcept.labelRu}» существует в Atlas</h3>
                  <p className="notes-group-author">
                    Здесь только исходные цитаты, заметки и Thought Threads, на которых основан этот узел. Из цитаты можно вернуться в точное место Reader.
                  </p>
                </div>
              </header>

              {evidenceLoading ? (
                <GuestNotice message="Загружаем доказательства смыслового узла…" />
              ) : evidenceError ? (
                <GuestNotice message={evidenceError} />
              ) : selectedEvidence.length === 0 ? (
                <GuestNotice message="Для этого узла сейчас нет доступных доказательств. Если исходная память была изменена или удалена, Atlas очистит связь при следующей индексации." />
              ) : (
                <div className="notes-group-items">
                  {selectedEvidence.map(evidence =>
                    evidence.sourceType === "annotation"
                      ? renderAnnotationEvidence(evidence)
                      : renderThreadEvidence(evidence)
                  )}
                </div>
              )}
            </section>
          )}

          {topRelationships.length > 0 && (
            <>
              <header className="notes-group-header">
                <div>
                  <p className="eyebrow">Semantic Relationships</p>
                  <h3 className="notes-group-title">Связи внутри вашей памяти</h3>
                  <p className="notes-group-author">
                    Связь усиливается, когда два узла встречаются в одном и том же сохранённом источнике или повторяются внутри одной книги.
                  </p>
                </div>
              </header>

              <div className="notes-group-items">
                {topRelationships.map(relationship => {
                  const left = conceptById.get(relationship.leftConceptId)!;
                  const right = conceptById.get(relationship.rightConceptId)!;
                  return (
                    <article key={relationship.id} className="notes-card">
                      <p className="eyebrow">
                        {relationship.sharedSourceCount >= 2 || relationship.sharedWorkCount >= 2 ? "Повторяющаяся связь" : "Связь"}
                      </p>
                      <h3 className="plan-card-name">{left.labelRu} ↔ {right.labelRu}</h3>
                      <p className="settings-section-note">
                        {relationship.sharedSourceCount} общих {sourceForm(relationship.sharedSourceCount)}
                        {relationship.sharedWorkCount > 0 ? ` · ${relationship.sharedWorkCount} книг` : ""}
                      </p>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {indexMessage && <p className="settings-section-note">{indexMessage}</p>}

      {remaining > 0 && (
        <div className="notes-card-actions">
          <button
            type="button"
            className="text-link"
            disabled={indexing}
            onClick={() => void refresh(true)}
          >
            {indexing ? "Анализируем…" : `Продолжить анализ · ещё ${remaining}`}
          </button>
        </div>
      )}

      <p className="settings-section-note">
        Новая память индексируется пакетами до восьми источников. Уже сохранённые узлы не оплачиваются и не пересчитываются заново, пока исходная цитата, заметка или нить не изменилась.
      </p>
    </div>
  );
}
