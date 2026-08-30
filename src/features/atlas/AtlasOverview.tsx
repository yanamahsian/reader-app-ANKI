// ATLAS PRODUCT INTEGRATION v1: the product shell that sits above Atlas's
// already-working features (Thought Threads, Unfinished Lines, Cross-Book
// Questions, Contradictions, Reading Memory, Automatic Connections) --
// nothing here is a new AI capability. It exists so opening Atlas reads as
// one intellectual map of the visitor's own reading rather than a long
// column of independent tools.
//
// Purely presentational: props in, JSX out. Every number shown here is
// already-loaded local Atlas state (Library + annotations + Threads +
// deterministic metadata connections) -- this component makes no request
// of its own, and in particular never calls atlas-question,
// atlas-contradictions, or atlas-unfinished-lines. Those stay explicit,
// paid user actions gated behind their own existing sections' own
// buttons; a real result count for them would require calling the AI just
// to populate an index, which is exactly what this component must never
// do. That's why their two entries below carry a short description of
// what the action does instead of a number -- never a fabricated "0" or a
// stale count from a different session.
import { useMemo } from "react";

export type AtlasSectionId = "threads" | "unfinished" | "questions" | "contradictions" | "memory" | "connections";

export interface AtlasOverviewProps {
  booksCount: number;
  fragmentsCount: number;
  memoryWorkCount: number;
  threadsCount: number;
  openThreadsCount: number;
  connectionsCount: number;
  connectionsStrongCount: number;
  onNavigate: (section: AtlasSectionId) => void;
}

// Standard Russian count-form selection (one / few / many) -- the same
// algorithm src/features/collections/pluralize.ts already applies to
// "книга/книги/книг" specifically; generalized here so this component can
// apply it to every noun it needs (фрагмент, нить, связь, ...) without a
// cross-feature import for what is, underneath, one well-known formula.
function ruCount(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function booksWord(n: number): string {
  return ruCount(n, "книга", "книги", "книг");
}

function fragmentsWord(n: number): string {
  return ruCount(n, "фрагмент", "фрагмента", "фрагментов");
}

function threadsWord(n: number): string {
  return ruCount(n, "нить", "нити", "нитей");
}

function connectionsWord(n: number): string {
  return ruCount(n, "связь", "связи", "связей");
}

function strongWord(n: number): string {
  return ruCount(n, "сильная", "сильных", "сильных");
}

interface IndexEntry {
  id: AtlasSectionId;
  eyebrow: string;
  title: string;
  description: string;
}

export function AtlasOverview({
  booksCount,
  fragmentsCount,
  memoryWorkCount,
  threadsCount,
  openThreadsCount,
  connectionsCount,
  connectionsStrongCount,
  onNavigate
}: AtlasOverviewProps) {

  const entries = useMemo<IndexEntry[]>(() => {
    return [
      {
        id: "threads",
        eyebrow: "Threads",
        title: "Нити мысли",
        description:
          threadsCount === 0
            ? "Свяжите несколько сохранённых фрагментов в собственную линию рассуждения."
            : `${threadsCount} ${threadsWord(threadsCount)}${openThreadsCount > 0 ? ` · ${openThreadsCount} с открытым вопросом` : ""}`
      },
      {
        id: "unfinished",
        eyebrow: "Unfinished",
        title: "Незавершённые линии",
        description: "Проверить, продолжает ли новое чтение одну из ваших открытых нитей мысли."
      },
      {
        id: "questions",
        eyebrow: "Questions",
        title: "Спросить Atlas",
        description: "Задать вопрос собственной сохранённой памяти чтения и получить обоснованный ответ."
      },
      {
        id: "contradictions",
        eyebrow: "Contradictions",
        title: "Противоречия",
        description: "Найти смысловые противоречия между вашими же сохранёнными фрагментами."
      },
      {
        id: "memory",
        eyebrow: "Memory",
        title: "Сохранённые мысли",
        description:
          fragmentsCount === 0
            ? "Пока нет сохранённых фрагментов -- они появятся, как только вы что-то сохраните во время чтения."
            : `${fragmentsCount} ${fragmentsWord(fragmentsCount)} · ${memoryWorkCount} ${booksWord(memoryWorkCount)}`
      },
      {
        id: "connections",
        eyebrow: "Connections",
        title: "Связи книг",
        description:
          connectionsCount === 0
            ? "Пока нет проверяемых связей между прочитанными книгами."
            : `${connectionsCount} ${connectionsWord(connectionsCount)}${connectionsStrongCount > 0 ? ` · ${connectionsStrongCount} ${strongWord(connectionsStrongCount)}` : ""}`
      }
    ];
  }, [threadsCount, openThreadsCount, fragmentsCount, memoryWorkCount, connectionsCount, connectionsStrongCount]);

  return (
    <>
      <section className="notes-group" aria-label="Обзор Atlas">
        <p className="settings-section-note">
          Atlas собирается из вашей библиотеки, сохранённых фрагментов и явных нитей мысли -- без предположений и фонового анализа. Ниже -- то, что Atlas уже видит в вашей истории чтения, и разделы, которые можно открыть.
        </p>

        <div className="subscription-blocks">
          <div className="subscription-block">
            <h2>{booksCount}</h2>
            <p className="settings-section-note">{booksCount === 0 ? "книг пока нет" : `${booksWord(booksCount)} в Atlas`}</p>
          </div>
          <div className="subscription-block">
            <h2>{fragmentsCount}</h2>
            <p className="settings-section-note">{fragmentsCount === 0 ? "фрагментов пока нет" : `сохранённых ${fragmentsWord(fragmentsCount)}`}</p>
          </div>
          <div className="subscription-block">
            <h2>{threadsCount}</h2>
            <p className="settings-section-note">{threadsCount === 0 ? "нитей пока нет" : `${threadsWord(threadsCount)} мысли`}</p>
          </div>
          <div className="subscription-block">
            <h2>{connectionsCount}</h2>
            <p className="settings-section-note">{connectionsCount === 0 ? "связей пока нет" : `проверяемых ${connectionsWord(connectionsCount)}`}</p>
          </div>
        </div>
      </section>

      <section className="notes-group" aria-label="Разделы Atlas">
        <header className="notes-group-header">
          <div>
            <p className="eyebrow">Index</p>
            <h2 className="notes-group-title">Разделы Atlas</h2>
            <p className="notes-group-author">Быстрый переход к каждой части вашего Atlas.</p>
          </div>
        </header>

        <div className="notes-group-items">
          {entries.map(entry => (
            <article key={entry.id} className="notes-card">
              <p className="eyebrow">{entry.eyebrow}</p>
              <h3 className="plan-card-name">{entry.title}</h3>
              <p className="settings-section-note">{entry.description}</p>
              <div className="notes-card-actions">
                <button type="button" className="text-link" onClick={() => onNavigate(entry.id)}>
                  Открыть
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
