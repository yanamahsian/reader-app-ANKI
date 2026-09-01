import { useEffect, useMemo, useState } from "react";
import type { Annotation } from "../../api/annotations";
import {
  loadAtlasGraph,
  type AtlasConcept,
  type AtlasConceptType,
  type AtlasGraphState,
  type AtlasRelationship
} from "../../api/atlasGraph";
import { genres, movements, themes } from "../../catalog";
import { GuestNotice } from "../shared/GuestNotice";
import { AtlasSemanticGraphSection } from "./AtlasSemanticGraphSection";

const themeLabels = new Map(themes.map(term => [term.id, term.label]));
const genreLabels = new Map(genres.map(term => [term.id, term.label]));
const movementLabels = new Map(movements.map(term => [term.id, term.label]));

function humanizeKey(value: string): string {
  const spaced = value.replace(/[-_]+/g, " ").trim();
  if (!spaced) return value;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function conceptLabel(concept: AtlasConcept): string {
  switch (concept.conceptType) {
    case "theme":
      return themeLabels.get(concept.conceptKey) ?? humanizeKey(concept.conceptKey);
    case "genre":
      return genreLabels.get(concept.conceptKey) ?? humanizeKey(concept.conceptKey);
    case "movement":
      return movementLabels.get(concept.conceptKey) ?? humanizeKey(concept.conceptKey);
    case "author":
      return concept.label || humanizeKey(concept.conceptKey);
  }
}

function typeLabel(type: AtlasConceptType): string {
  switch (type) {
    case "theme":
      return "Тема";
    case "genre":
      return "Жанр";
    case "movement":
      return "Направление";
    case "author":
      return "Автор";
  }
}

function booksForm(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "книга";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "книги";
  return "книг";
}

function signalsForm(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "сигнал";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "сигнала";
  return "сигналов";
}

interface LoadedGraph {
  state: AtlasGraphState;
  concepts: AtlasConcept[];
  relationships: AtlasRelationship[];
}

interface AtlasConceptGraphSectionProps {
  annotationById: Map<string, Annotation>;
  unavailableAnnotationId: string | null;
  onOpenAnnotation: (annotation: Annotation) => void;
}

export function AtlasConceptGraphSection({
  annotationById,
  unavailableAnnotationId,
  onOpenAnnotation
}: AtlasConceptGraphSectionProps) {
  const [graph, setGraph] = useState<LoadedGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const next = await loadAtlasGraph();
        if (!cancelled) setGraph(next);
      } catch (loadError) {
        console.error("Atlas persistent graph load failed:", loadError);
        if (!cancelled) setError("Не удалось собрать постоянный граф Atlas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const conceptById = useMemo(
    () => new Map((graph?.concepts ?? []).map(concept => [concept.id, concept])),
    [graph?.concepts]
  );

  const topConcepts = useMemo(() => {
    const concepts = graph?.concepts ?? [];
    return [...concepts]
      .sort((left, right) =>
        right.workCount - left.workCount ||
        right.evidenceCount - left.evidenceCount ||
        conceptLabel(left).localeCompare(conceptLabel(right), "ru")
      )
      .slice(0, 16);
  }, [graph?.concepts]);

  const topRelationships = useMemo(() => {
    const relationships = graph?.relationships ?? [];
    const recurring = relationships.filter(item => item.sharedWorkCount >= 2);
    const source = recurring.length ? recurring : relationships;
    return source
      .filter(item => conceptById.has(item.leftConceptId) && conceptById.has(item.rightConceptId))
      .slice(0, 12);
  }, [graph?.relationships, conceptById]);

  return (
    <>
      <section className="notes-group" aria-label="Постоянный граф концептов Atlas">
        <header className="notes-group-header">
          <div>
            <p className="eyebrow">Concept Graph</p>
            <h2 className="notes-group-title">Постоянные концепты и связи</h2>
            <p className="notes-group-author">
              Atlas материализует темы, жанры, направления и авторов из реально прочитанных книг и связывает их через накопленную историю чтения. Этот слой строится детерминированно по проверяемым метаданным — без AI-догадок по тексту заметок.
            </p>
          </div>
        </header>

        {loading ? (
          <GuestNotice message="Обновляем постоянный граф Atlas…" />
        ) : error ? (
          <GuestNotice message={error} />
        ) : !graph || graph.state.activeWorkCount === 0 || topConcepts.length === 0 ? (
          <GuestNotice message="Граф появится после реального чтения книги, в которой есть структурированные темы, жанр, направление или автор." />
        ) : (
          <>
            <div className="subscription-blocks">
              <div className="subscription-block">
                <h2>{graph.state.activeWorkCount}</h2>
                <p className="settings-section-note">{booksForm(graph.state.activeWorkCount)} в графе</p>
              </div>
              <div className="subscription-block">
                <h2>{graph.state.conceptCount}</h2>
                <p className="settings-section-note">постоянных концептов</p>
              </div>
              <div className="subscription-block">
                <h2>{graph.state.relationshipCount}</h2>
                <p className="settings-section-note">постоянных связей</p>
              </div>
              <div className="subscription-block">
                <h2>{graph.state.sourceSignalCount}</h2>
                <p className="settings-section-note">{signalsForm(graph.state.sourceSignalCount)} памяти</p>
              </div>
            </div>

            <div className="notes-group-items">
              {topConcepts.map(concept => (
                <article key={concept.id} className="notes-card">
                  <p className="eyebrow">{typeLabel(concept.conceptType)}</p>
                  <h3 className="plan-card-name">{conceptLabel(concept)}</h3>
                  <p className="settings-section-note">
                    {concept.workCount} {booksForm(concept.workCount)} · {concept.evidenceCount} {signalsForm(concept.evidenceCount)}
                  </p>
                </article>
              ))}
            </div>

            {topRelationships.length > 0 && (
              <>
                <header className="notes-group-header">
                  <div>
                    <p className="eyebrow">Relationships</p>
                    <h3 className="notes-group-title">Устойчивые связи</h3>
                    <p className="notes-group-author">
                      В приоритете связи, которые повторяются в нескольких книгах вашей истории чтения; если таких ещё нет, показываются первые связи внутри уже прочитанных работ.
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
                          {relationship.sharedWorkCount >= 2 ? "Повторяющаяся связь" : "Связь"}
                        </p>
                        <h3 className="plan-card-name">
                          {conceptLabel(left)} ↔ {conceptLabel(right)}
                        </h3>
                        <p className="settings-section-note">
                          {relationship.sharedWorkCount} {booksForm(relationship.sharedWorkCount)} · {relationship.evidenceCount} {signalsForm(relationship.evidenceCount)}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            <p className="settings-section-note">
              Показаны наиболее устойчивые узлы и связи. Полный граф хранится в аккаунте и пересобирается только когда меняется постоянная память чтения.
            </p>
          </>
        )}
      </section>

      <AtlasSemanticGraphSection
        annotationById={annotationById}
        unavailableAnnotationId={unavailableAnnotationId}
        onOpenAnnotation={onOpenAnnotation}
      />
    </>
  );
}
