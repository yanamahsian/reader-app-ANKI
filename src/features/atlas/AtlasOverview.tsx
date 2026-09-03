// ATLAS PRODUCT INTEGRATION v1: the product shell that sits above Atlas's
// already-working features (Thought Threads, Unfinished Lines, Cross-Book
// Questions, Contradictions, Reading Memory, Automatic Connections).
// Persistent Atlas Memory v1 adds a durable signal count sourced from the
// server-side atlas_memory_signals substrate; this component remains purely
// presentational and never runs AI just to populate its index.
import { useMemo } from "react";

export type AtlasSectionId = "canon" | "threads" | "unfinished" | "questions" | "contradictions" | "memory" | "connections";

export interface AtlasOverviewProps {
  booksCount: number;
  fragmentsCount: number;
  memorySignalsCount: number;
  memoryWorkCount: number;
  threadsCount: number;
  openThreadsCount: number;
  connectionsCount: number;
  connectionsStrongCount: number;
  onNavigate: (section: AtlasSectionId) => void;
}

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

function signalsWord(n: number): string {
  return ruCount(n, "сигнал", "сигнала", "сигналов");
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
  memorySignalsCount,
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
        id: "canon",
        eyebrow: "The Canon",
        title: "The Canon",
        description: "Кураторская карта ключевой мировой литературы — традиции, эпохи и маршруты чтения."
      },
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
        title: "Память чтения",
        description:
          memorySignalsCount === 0
            ? "Память начнёт расти, когда появится реальное чтение, закладка, сохранённый фрагмент или нить мысли."
            : `${memorySignalsCount} ${signalsWord(memorySignalsCount)} памяти · ${fragmentsCount} ${fragmentsWord(fragmentsCount)} · ${memoryWorkCount} ${booksWord(memoryWorkCount)}`
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
  }, [
    threadsCount,
    openThreadsCount,
    memorySignalsCount,
    fragmentsCount,
    memoryWorkCount,
    connectionsCount,
    connectionsStrongCount
  ]);

  return (
    <>
      <section className="notes-group" aria-label="Обзор Atlas">
        <p className="settings-section-note">
          Atlas теперь опирается на постоянную память чтения: сервер сохраняет проверяемые сигналы из реального чтения, библиотеки, закладок, заметок и нитей мысли. Здесь нет фоновых догадок или автоматически выдуманных концептов — только то, что действительно произошло в AN.KI.
        </p>

        <div className="subscription-blocks">
          <div className="subscription-block">
            <h2>{booksCount}</h2>
            <p className="settings-section-note">{booksCount === 0 ? "книг пока нет" : `${booksWord(booksCount)} в Atlas`}</p>
          </div>
          <div className="subscription-block">
            <h2>{memorySignalsCount}</h2>
            <p className="settings-section-note">{memorySignalsCount === 0 ? "память пока пуста" : `${signalsWord(memorySignalsCount)} памяти`}</p>
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
