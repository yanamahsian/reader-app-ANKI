import { useEffect, useState } from "react";
import { useAuth } from "../../auth/supabaseAuth";
import { fetchAndMergeWorksByIds, listLibrary, type LibraryEntry } from "../../api/userLibrary";
import { getBookById } from "../../catalog";
import type { Book } from "../../catalog";
import { GuestNotice } from "../shared/GuestNotice";
import { ShellPage } from "../shared/ShellPage";
import { buildAtlasConnections, type AtlasConnection } from "./buildAtlas";

interface AtlasViewProps {
  onBack: () => void;
  onOpenBookDetail: (bookId: string) => void;
  onRequireSignIn: () => void;
}

interface AtlasState {
  entries: LibraryEntry[];
  activeBooks: Book[];
  connections: AtlasConnection[];
}

const EMPTY_ATLAS: AtlasState = {
  entries: [],
  activeBooks: [],
  connections: []
};

export function AtlasView({ onBack, onOpenBookDetail, onRequireSignIn }: AtlasViewProps) {
  const { isAuthenticated } = useAuth();
  const [atlas, setAtlas] = useState<AtlasState>(EMPTY_ATLAS);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setAtlas(EMPTY_ATLAS);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    async function loadAtlas(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const entries = await listLibrary();
        const activeEntries = entries.filter(entry => entry.status === "reading" || entry.status === "finished");
        const workIds = Array.from(new Set(activeEntries.map(entry => entry.workId)));

        await fetchAndMergeWorksByIds(workIds);

        if (cancelled) return;

        const activeBooks = workIds
          .map(workId => getBookById(workId))
          .filter((book): book is Book => Boolean(book));

        setAtlas({
          entries,
          activeBooks,
          connections: buildAtlasConnections(activeBooks)
        });
      } catch (loadError) {
        console.error("Atlas load failed:", loadError);
        if (!cancelled) setError("Не удалось собрать Atlas из вашей библиотеки.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAtlas();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const readingCount = atlas.entries.filter(entry => entry.status === "reading").length;
  const finishedCount = atlas.entries.filter(entry => entry.status === "finished").length;
  const wantToReadCount = atlas.entries.filter(entry => entry.status === "want_to_read").length;

  return (
    <ShellPage
      onBack={onBack}
      eyebrow="Atlas"
      title="Ваш интеллектуальный Atlas"
      subtitle="Связи между книгами, которые уже существуют в вашей истории чтения."
    >
      {!isAuthenticated ? (
        <>
          <GuestNotice message="Atlas собирается из вашей личной истории чтения. Войдите, чтобы AN.KI мог помнить прочитанные книги и связи между ними." />
          <button type="button" className="primary-button" onClick={onRequireSignIn}>
            Войти
          </button>
        </>
      ) : isLoading ? (
        <GuestNotice message="Собираем Atlas из вашей библиотеки…" />
      ) : error ? (
        <GuestNotice message={error} />
      ) : (
        <>
          <section className="subscription-current">
            <h2>Atlas v1 работает без платного AI</h2>
            <p className="settings-section-note">
              Сейчас связи строятся только из проверяемых данных AN.KI: авторов, тем, направлений, эпох, жанров,
              литературных традиций, подборок и времени публикации. Ни один запрос к OpenAI для этой страницы не выполняется.
            </p>
          </section>

          <section className="subscription-blocks" aria-label="Состояние Atlas">
            <div className="subscription-block">
              <h2>{atlas.activeBooks.length}</h2>
              <p className="settings-section-note">книг уже участвуют в Atlas</p>
            </div>
            <div className="subscription-block">
              <h2>{atlas.connections.length}</h2>
              <p className="settings-section-note">проверяемых связей найдено</p>
            </div>
            <div className="subscription-block">
              <h2>{readingCount}</h2>
              <p className="settings-section-note">сейчас читаете</p>
            </div>
            <div className="subscription-block">
              <h2>{finishedCount}</h2>
              <p className="settings-section-note">завершено</p>
            </div>
          </section>

          {wantToReadCount > 0 && (
            <p className="settings-section-note">
              Ещё {wantToReadCount} книг в «Хочу прочитать» пока не влияют на Atlas: книга входит в интеллектуальную историю,
              когда чтение действительно началось.
            </p>
          )}

          {atlas.activeBooks.length < 2 ? (
            <GuestNotice message="Для первой связи нужны хотя бы две книги со статусом «Читаю» или «Прочитано»." />
          ) : atlas.connections.length === 0 ? (
            <GuestNotice message="Книги уже в Atlas, но по текущим проверяемым метаданным между ними пока нет достаточно сильной связи." />
          ) : (
            <section className="subscription-plans" aria-label="Связи между книгами">
              {atlas.connections.map(connection => (
                <article
                  key={connection.id}
                  className={connection.strength === "strong" ? "plan-card plan-card-highlighted" : "plan-card"}
                >
                  <p className="eyebrow">{connection.strength === "strong" ? "Сильная связь" : "Связь"}</p>
                  <h3 className="plan-card-name">{connection.left.title}</h3>
                  <p className="settings-section-note">{connection.left.authorName}</p>
                  <p className="plan-card-price" aria-hidden="true">↔</p>
                  <h3 className="plan-card-name">{connection.right.title}</h3>
                  <p className="settings-section-note">{connection.right.authorName}</p>
                  <ul className="plan-card-features">
                    {connection.reasons.map(reason => (
                      <li key={`${connection.id}-${reason.kind}-${reason.label}`}>{reason.label}</li>
                    ))}
                  </ul>
                  <div>
                    <button type="button" className="text-link" onClick={() => onOpenBookDetail(connection.left.id)}>
                      Открыть «{connection.left.title}»
                    </button>
                  </div>
                  <div>
                    <button type="button" className="text-link" onClick={() => onOpenBookDetail(connection.right.id)}>
                      Открыть «{connection.right.title}»
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <section className="subscription-current">
            <h2>Что добавит AI позже</h2>
            <p className="settings-section-note">
              AI-слой будет находить связи, которых нет в каталожной разметке: общие идеи внутри текста, противоречия,
              развитие одной темы между авторами и связи с будущими заметками и выделениями. Он будет дополнять Atlas,
              а не заменять уже работающую память и проверяемые связи.
            </p>
          </section>
        </>
      )}
    </ShellPage>
  );
}
