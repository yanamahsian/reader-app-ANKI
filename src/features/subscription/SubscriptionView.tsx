import { ShellPage } from "../shared/ShellPage";

interface SubscriptionViewProps {
  onBack: () => void;
}

interface PlanDef {
  id: string;
  name: string;
  priceNote: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
}

// Neutral placeholder plan names/prices per the spec: no final prices are
// invented here — every card carries an explicit "цена будет определена"
// note instead of a number. Checkout is not wired up, so every action
// button is disabled and labelled "Скоро" rather than looking clickable.
const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    priceNote: "бесплатно",
    tagline: "Знакомство с библиотекой AN.KI",
    features: ["Доступ к части каталога", "Базовый режим чтения", "Ограниченное число заметок"],
  },
  {
    id: "reader",
    name: "Reader",
    priceNote: "цена будет определена",
    tagline: "Для тех, кто читает много и регулярно",
    features: ["Полный доступ к каталогу", "Расширенные настройки чтения", "Синхронизация заметок"],
    highlighted: true,
  },
  {
    id: "full-access",
    name: "Full Access",
    priceNote: "цена будет определена",
    tagline: "Максимум возможностей AN.KI",
    features: ["Всё из Reader", "Ранний доступ к AI-функциям", "Приоритетная поддержка"],
  },
];

export function SubscriptionView({ onBack }: SubscriptionViewProps) {
  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Подписка" subtitle="Оплата и тарифы появятся в одном из следующих обновлений.">

      <section className="subscription-current">
        <h2>Текущий план</h2>
        <p className="settings-section-note">Free — активен по умолчанию, без учётной записи.</p>
      </section>

      <section className="subscription-plans">
        {PLANS.map((plan) => (
          <article
            key={plan.id}
            className={plan.highlighted ? "plan-card plan-card-highlighted" : "plan-card"}
          >
            <h3 className="plan-card-name">{plan.name}</h3>
            <p className="plan-card-price">{plan.priceNote}</p>
            <p className="plan-card-tagline">{plan.tagline}</p>
            <ul className="plan-card-features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button type="button" className="primary-button" disabled>
              Скоро
            </button>
          </article>
        ))}
      </section>

      <section className="subscription-blocks">
        <div className="subscription-block">
          <h2>AI-функции</h2>
          <p className="settings-section-note">Подсказки, разбор текста и умные заметки — в разработке.</p>
        </div>
        <div className="subscription-block">
          <h2>Чтение</h2>
          <p className="settings-section-note">Расширенные темы и вёрстка для режима чтения.</p>
        </div>
        <div className="subscription-block">
          <h2>Заметки</h2>
          <p className="settings-section-note">Синхронизация и экспорт заметок между устройствами.</p>
        </div>
        <div className="subscription-block">
          <h2>Управление подпиской</h2>
          <p className="settings-section-note">Смена плана и отмена — появятся вместе с оплатой.</p>
        </div>
      </section>

    </ShellPage>
  );
}
