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

interface RelationshipEvidenceState {
  left: AtlasSemanticEvidence[];
  right: AtlasSemanticEvidence[];
}

interface SharedSourceProof {
  left: AtlasSemanticEvidence;
  right: AtlasSemanticEvidence;
}

interface SharedWorkProof {
  workId: string;
  left: AtlasSemanticEvidence[];
  right: AtlasSemanticEvidence[];
}

interface AtlasSemanticGraphSectionProps {
  annotationById?: Map<string, Annotation>;
  unavailableAnnotationId?: string | null;
  onOpenAnnotation?: (annotation: Annotation) => void;
}

const EMPTY_ANNOTATIONS = new Map<string, Annotation>();
const EMPTY_RELATIONSHIP_EVIDENCE: RelationshipEvidenceState = { left: [], right: [] };

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
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return null;
  }
}

function formatEvidenceDate(iso: string): string {
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

function confidenceLabel(value: number): string {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return `${Math.round(normalized * 100)}% уверенности`;
}

function sourceKey(evidence: AtlasSemanticEvidence): string {
  return `${evidence.sourceType}:${evidence.sourceId}`;
}

export function AtlasSemanticGraphSection({
  annotationById = EMPTY_ANNOTATIONS,
  unavailableAnnotationId = null,
  onOpenAnnotation
}: AtlasSemanticGraphSectionProps = {}) {
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

  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [relationshipEvidence, setRelationshipEvidence] = useState<RelationshipEvidenceState>(
    EMPTY_RELATIONSHIP_EVIDENCE
  );
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);

  const [threadById, setThreadById] = useState<Map<string, ThoughtThread>>(new Map());
  const evidenceRequest = useRef(0);
  const relationshipRequest = useRef(0);
  const canDrillDown = typeof onOpenAnnotation === "function";

  async function refresh(runIndex: boolean, cancelled?: () => boolean): Promise<void> {
    if (runIndex) {
      setIndexing(true);
      setIndexMessage(null);
      try {
        const result = await runAtlasSemanticIndex();
        if (!cancelled?.()) {
          setIndexResult(result);
          if (result.failed > 0 && !result.indexed) {
            setIndexMessage("Новый пакет Atlas не удалось проиндексировать. Квота за неудавшийся AI-вызов возвращена; можно повторить анализ.");
          }
        }
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
      relationshipRequest.current += 1;
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
    const recurring = graph.relationships.filter(
      item => item.sharedSourceCount >= 2 || item.sharedWorkCount >= 2
    );
    const source = recurring.length ? recurring : graph.relationships;
    return source
      .filter(item => conceptById.has(item.leftConceptId) && conceptById.has(item.rightConceptId))
      .slice(0, 12);
  }, [graph.relationships, conceptById]);

  const selectedConcept = selectedConceptId ? conceptById.get(selectedConceptId) ?? null : null;
  const selectedRelationship = selectedRelationshipId
    ? graph.relationships.find(item => item.id === selectedRelationshipId) ?? null
    : null;
  const remaining = indexResult?.remaining ?? 0;

  const relationshipProof = useMemo(() => {
    const rightBySource = new Map(relationshipEvidence.right.map(item => [sourceKey(item), item]));
    const sharedSources: SharedSourceProof[] = [];
    const exactSharedKeys = new Set<string>();

    for (const left of relationshipEvidence.left) {
      const key = sourceKey(left);
      const right = rightBySource.get(key);
      if (!right) continue;
      exactSharedKeys.add(key);
      sharedSources.push({ left, right });
    }

    const leftByWork = new Map<string, AtlasSemanticEvidence[]>();
    const rightByWork = new Map<string, AtlasSemanticEvidence[]>();

    for (const item of relationshipEvidence.left) {
      if (!item.workId) continue;
      const list = leftByWork.get(item.workId) ?? [];
      list.push(item);
      leftByWork.set(item.workId, list);
    }
    for (const item of relationshipEvidence.right) {
      if (!item.workId) continue;
      const list = rightByWork.get(item.workId) ?? [];
      list.push(item);
      rightByWork.set(item.workId, list);
    }

    const sharedWorks: SharedWorkProof[] = [];
    for (const [workId, leftItems] of leftByWork) {
      const rightItems = rightByWork.get(workId);
      if (!rightItems?.length) continue;

      const leftOutsideExact = leftItems.filter(item => !exactSharedKeys.has(sourceKey(item)));
      const rightOutsideExact = rightItems.filter(item => !exactSharedKeys.has(sourceKey(item)));

      // "Общая книга" is shown only when BOTH concepts have evidence in the
      // work outside the exact source(s) already presented above. Otherwise
      // repeating those same items would falsely describe one shared quote as
      // independent confirmation inside the book.
      if (leftOutsideExact.length === 0 || rightOutsideExact.length === 0) continue;

      sharedWorks.push({
        workId,
        left: leftOutsideExact,
        right: rightOutsideExact
      });
    }

    return { sharedSources, sharedWorks };
  }, [relationshipEvidence]);

  function resetConceptEvidence(): void {
    evidenceRequest.current += 1;
    setSelectedConceptId(null);
    setSelectedEvidence([]);
    setEvidenceError(null);
    setEvidenceLoading(false);
  }

  function resetRelationshipEvidence(): void {
    relationshipRequest.current += 1;
    setSelectedRelationshipId(null);
    setRelationshipEvidence(EMPTY_RELATIONSHIP_EVIDENCE);
    setRelationshipError(null);
    setRelationshipLoading(false);
  }

  async function loadThreadsIfNeeded(evidence: AtlasSemanticEvidence[]): Promise<Map<string, ThoughtThread>> {
    if (!evidence.some(item => item.sourceType === "thread")) return new Map();
    const loadedThreads = await listThoughtThreads();
    return new Map(loadedThreads.map(thread => [thread.id, thread]));
  }

  async function toggleEvidence(concept: AtlasSemanticConcept): Promise<void> {
    if (!canDrillDown) return;

    if (selectedConceptId === concept.id) {
      resetConceptEvidence();
      return;
    }

    resetRelationshipEvidence();
    const requestId = evidenceRequest.current + 1;
    evidenceRequest.current = requestId;
    setSelectedConceptId(concept.id);
    setSelectedEvidence([]);
    setEvidenceError(null);
    setEvidenceLoading(true);

    try {
      const evidence = await listAtlasSemanticEvidence(concept.id);
      const threads = await loadThreadsIfNeeded(evidence);
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

  async function toggleRelationshipEvidence(relationship: AtlasSemanticRelationship): Promise<void> {
    if (!canDrillDown) return;

    if (selectedRelationshipId === relationship.id) {
      resetRelationshipEvidence();
      return;
    }

    resetConceptEvidence();
    const requestId = relationshipRequest.current + 1;
    relationshipRequest.current = requestId;
    setSelectedRelationshipId(relationship.id);
    setRelationshipEvidence(EMPTY_RELATIONSHIP_EVIDENCE);
    setRelationshipError(null);
    setRelationshipLoading(true);

    try {
      const [left, right] = await Promise.all([
        listAtlasSemanticEvidence(relationship.leftConceptId),
        listAtlasSemanticEvidence(relationship.rightConceptId)
      ]);
      const threads = await loadThreadsIfNeeded([...left, ...right]);
      if (relationshipRequest.current !== requestId) return;
      setRelationshipEvidence({ left, right });
      setThreadById(threads);
    } catch (error) {
      console.error("Atlas semantic relationship evidence load failed:", error);
      if (relationshipRequest.current === requestId) {
        setRelationshipError("Не удалось загрузить доказательства этой смысловой связи.");
      }
    } finally {
      if (relationshipRequest.current === requestId) setRelationshipLoading(false);
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

        {annotation && onOpenAnnotation && (
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
                  {onOpenAnnotation && (
                    <div className="notes-card-actions">
                      <button type="button" className="text-link" onClick={() => onOpenAnnotation(annotation)}>
                        Вернуться к точному фрагменту
                      </button>
                    </div>
                  )}
                  {unavailableAnnotationId === annotation.id && (
                    <p className="book-detail-unavailable">Это издание сейчас недоступно в вашей юрисдикции.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>
    );
  }

  function renderSharedSourceProof(
    proof: SharedSourceProof,
    leftConcept: AtlasSemanticConcept,
    rightConcept: AtlasSemanticConcept
  ) {
    const source = proof.left;
    const annotation = source.sourceType === "annotation"
      ? annotationById.get(source.sourceId) ?? null
      : null;
    const thread = source.sourceType === "thread" ? threadById.get(source.sourceId) ?? null : null;
    const workId = annotation?.workId ?? source.workId;
    const book = workId ? getBookById(workId) : null;
    const threadAnnotations = thread
      ? thread.annotationIds
          .map(id => annotationById.get(id))
          .filter((item): item is Annotation => Boolean(item))
      : [];

    return (
      <article key={`shared-source-${sourceKey(source)}`} className="notes-card">
        <p className="eyebrow">Общий источник</p>
        {book && (
          <p className="notes-card-edition">
            {book.title}{book.authorName ? ` · ${book.authorName}` : ""}
          </p>
        )}

        {annotation && <blockquote className="notes-card-quote">{annotation.quoteText}</blockquote>}
        {annotation?.noteText && <p className="notes-card-note">{annotation.noteText}</p>}
        {thread && <h3 className="plan-card-name">{thread.title}</h3>}
        {thread?.question && (
          <p className="settings-section-note"><strong>Вопрос:</strong> {thread.question}</p>
        )}
        {thread?.synthesisNote && <p className="notes-card-note">{thread.synthesisNote}</p>}

        <p className="settings-section-note">
          <strong>{leftConcept.labelRu}:</strong> {proof.left.excerpt || "связь извлечена из этого источника"}
        </p>
        <p className="settings-section-note">
          <strong>{rightConcept.labelRu}:</strong> {proof.right.excerpt || "связь извлечена из этого источника"}
        </p>
        <p className="settings-section-note">
          {confidenceLabel(proof.left.confidence)} / {confidenceLabel(proof.right.confidence)}
        </p>

        {annotation && onOpenAnnotation && (
          <div className="notes-card-actions">
            <button type="button" className="text-link" onClick={() => onOpenAnnotation(annotation)}>
              Вернуться к общему фрагменту
            </button>
          </div>
        )}

        {threadAnnotations.length > 0 && (
          <div className="notes-group-items">
            {threadAnnotations.slice(0, 4).map(item => (
              <div key={`${source.id}-${item.id}`} className="notes-card">
                <blockquote className="notes-card-quote">{item.quoteText}</blockquote>
                {onOpenAnnotation && (
                  <div className="notes-card-actions">
                    <button type="button" className="text-link" onClick={() => onOpenAnnotation(item)}>
                      К фрагменту нити
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {annotation && unavailableAnnotationId === annotation.id && (
          <p className="book-detail-unavailable">Это издание сейчас недоступно в вашей юрисдикции.</p>
        )}
      </article>
    );
  }

  function renderCompactWorkEvidence(evidence: AtlasSemanticEvidence, concept: AtlasSemanticConcept) {
    const annotation = evidence.sourceType === "annotation"
      ? annotationById.get(evidence.sourceId) ?? null
      : null;
    const thread = evidence.sourceType === "thread" ? threadById.get(evidence.sourceId) ?? null : null;

    return (
      <div key={`${concept.id}-${evidence.id}`} className="notes-card">
        <p className="eyebrow">{concept.labelRu}</p>
        {annotation ? (
          <>
            <blockquote className="notes-card-quote">{annotation.quoteText}</blockquote>
            {annotation.noteText && <p className="notes-card-note">{annotation.noteText}</p>}
          </>
        ) : thread ? (
          <>
            <h3 className="plan-card-name">{thread.title}</h3>
            {thread.question && <p className="settings-section-note">{thread.question}</p>}
          </>
        ) : evidence.excerpt ? (
          <p className="settings-section-note">{evidence.excerpt}</p>
        ) : (
          <p className="settings-section-note">Сохранённый источник больше не доступен в локальной выборке.</p>
        )}

        {evidence.excerpt && (annotation || thread) && (
          <p className="settings-section-note"><strong>Почему Atlas связал:</strong> {evidence.excerpt}</p>
        )}

        {annotation && onOpenAnnotation && (
          <div className="notes-card-actions">
            <button type="button" className="text-link" onClick={() => onOpenAnnotation(annotation)}>
              Вернуться к точному фрагменту
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderSharedWorkProof(
    proof: SharedWorkProof,
    leftConcept: AtlasSemanticConcept,
    rightConcept: AtlasSemanticConcept
  ) {
    const book = getBookById(proof.workId);
    return (
      <article key={`shared-work-${proof.workId}`} className="notes-card">
        <p className="eyebrow">Общая книга</p>
        <h3 className="plan-card-name">
          {book ? `${book.title}${book.authorName ? ` · ${book.authorName}` : ""}` : proof.workId}
        </h3>
        <p className="settings-section-note">
          Оба узла имеют отдельные evidence в памяти этой книги, помимо уже показанных общих источников.
        </p>
        <div className="notes-group-items">
          {proof.left.slice(0, 3).map(item => renderCompactWorkEvidence(item, leftConcept))}
          {proof.right.slice(0, 3).map(item => renderCompactWorkEvidence(item, rightConcept))}
        </div>
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
                  {canDrillDown && (
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
                  )}
                </article>
              );
            })}
          </div>

          {selectedConcept && canDrillDown && (
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
                    Связь усиливается, когда два узла встречаются в одном и том же сохранённом источнике или повторяются внутри одной книги. Теперь каждую связь можно развернуть до её исходных доказательств.
                  </p>
                </div>
              </header>

              <div className="notes-group-items">
                {topRelationships.map(relationship => {
                  const left = conceptById.get(relationship.leftConceptId)!;
                  const right = conceptById.get(relationship.rightConceptId)!;
                  const expanded = selectedRelationshipId === relationship.id;
                  const targetId = `atlas-semantic-relationship-${relationship.id}`;
                  return (
                    <article key={relationship.id} className="notes-card">
                      <p className="eyebrow">
                        {relationship.sharedSourceCount >= 2 || relationship.sharedWorkCount >= 2
                          ? "Повторяющаяся связь"
                          : "Связь"}
                      </p>
                      <h3 className="plan-card-name">{left.labelRu} ↔ {right.labelRu}</h3>
                      <p className="settings-section-note">
                        {relationship.sharedSourceCount} общих {sourceForm(relationship.sharedSourceCount)}
                        {relationship.sharedWorkCount > 0 ? ` · ${relationship.sharedWorkCount} книг` : ""}
                      </p>
                      {canDrillDown && (
                        <div className="notes-card-actions">
                          <button
                            type="button"
                            className="text-link"
                            aria-expanded={expanded}
                            aria-controls={targetId}
                            onClick={() => void toggleRelationshipEvidence(relationship)}
                          >
                            {expanded ? "Скрыть основание связи" : "Почему они связаны"}
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {selectedRelationship && canDrillDown && (() => {
            const leftConcept = conceptById.get(selectedRelationship.leftConceptId);
            const rightConcept = conceptById.get(selectedRelationship.rightConceptId);
            if (!leftConcept || !rightConcept) return null;

            return (
              <section
                id={`atlas-semantic-relationship-${selectedRelationship.id}`}
                className="notes-group"
                aria-label={`Доказательства связи ${leftConcept.labelRu} и ${rightConcept.labelRu}`}
              >
                <header className="notes-group-header">
                  <div>
                    <p className="eyebrow">Relationship Evidence</p>
                    <h3 className="notes-group-title">{leftConcept.labelRu} ↔ {rightConcept.labelRu}</h3>
                    <p className="notes-group-author">
                      Atlas не объясняет эту связь постфактум новым AI-текстом. Ниже показано то, что уже хранится в evidence: общий сохранённый источник и/или независимое повторение обоих узлов внутри одной книги.
                    </p>
                  </div>
                </header>

                {relationshipLoading ? (
                  <GuestNotice message="Проверяем доказательную базу связи…" />
                ) : relationshipError ? (
                  <GuestNotice message={relationshipError} />
                ) : relationshipProof.sharedSources.length === 0 && relationshipProof.sharedWorks.length === 0 ? (
                  <GuestNotice message="Основание этой связи больше не найдено среди доступных evidence. После следующей перестройки semantic graph устаревшая связь будет удалена." />
                ) : (
                  <>
                    {relationshipProof.sharedSources.length > 0 && (
                      <>
                        <header className="notes-group-header">
                          <div>
                            <p className="eyebrow">Shared Sources</p>
                            <h3 className="notes-group-title">В одном сохранённом источнике</h3>
                          </div>
                        </header>
                        <div className="notes-group-items">
                          {relationshipProof.sharedSources.map(proof =>
                            renderSharedSourceProof(proof, leftConcept, rightConcept)
                          )}
                        </div>
                      </>
                    )}

                    {relationshipProof.sharedWorks.length > 0 && (
                      <>
                        <header className="notes-group-header">
                          <div>
                            <p className="eyebrow">Shared Works</p>
                            <h3 className="notes-group-title">Повторение внутри одной книги</h3>
                          </div>
                        </header>
                        <div className="notes-group-items">
                          {relationshipProof.sharedWorks.map(proof =>
                            renderSharedWorkProof(proof, leftConcept, rightConcept)
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            );
          })()}
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
        Новая память индексируется пакетами до восьми источников. Уже сохранённые узлы не оплачиваются и не пересчитываются заново, пока исходная цитата, заметка или нить не изменилась. Просмотр доказательств узлов и связей AI не вызывает.
      </p>
    </div>
  );
}
