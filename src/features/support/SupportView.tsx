import { ShellPage } from "../shared/ShellPage";

interface SupportViewProps {
  onBack: () => void;
}

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ: FaqItem[] = [
  {
    question: "Почему я не вижу обложку у книги?",
    answer:
      "Часть изданий ещё не получила обложку в каталоге — вместо неё показывается фирменная заглушка AN.KI. Это не ошибка.",
  },
  {
    question: "Почему книга недоступна для чтения?",
    answer:
      "Некоторые издания временно закрыты по юрисдикции или ещё проходят подготовку текста. Доступность может измениться.",
  },
  {
    question: "Появится ли вход в аккаунт?",
    answer:
      "Да, авторизация, личная библиотека и заметки уже заложены в интерфейс и появятся в одном из следующих обновлений.",
  },
];

interface TopicItem {
  title: string;
  description: string;
}

const TOPICS: TopicItem[] = [
  { title: "Проблема с книгой", description: "Текст не открывается, отсутствует обложка или неверные данные издания." },
  { title: "Проблема с оплатой", description: "Вопросы по подписке и оплате — раздел появится вместе с оплатой." },
  { title: "Сообщить об ошибке", description: "Что-то выглядит или работает не так, как должно." },
  { title: "Связаться с поддержкой", description: "Любой другой вопрос об AN.KI." },
];

// No ticket backend yet — this is a genuinely complete, finished-looking
// page by design (per spec item 14), not an empty placeholder div. Every
// contact action is disabled/"Скоро" rather than pretending to submit
// somewhere, matching the pattern used across the other guest-state pages.
export function SupportView({ onBack }: SupportViewProps) {
  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Помощь и поддержка" subtitle="Раздел обращений в поддержку появится позже. Ниже — ответы на частые вопросы.">

      <section className="support-topics">
        {TOPICS.map((topic) => (
          <article key={topic.title} className="support-topic-card">
            <h3>{topic.title}</h3>
            <p className="settings-section-note">{topic.description}</p>
            <button type="button" className="text-link" disabled>
              Скоро
            </button>
          </article>
        ))}
      </section>

      <section className="support-faq">
        <h2>Частые вопросы</h2>
        <dl className="support-faq-list">
          {FAQ.map((item) => (
            <div key={item.question} className="support-faq-item">
              <dt>{item.question}</dt>
              <dd>{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

    </ShellPage>
  );
}
