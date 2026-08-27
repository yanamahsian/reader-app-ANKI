import { PlanEmblem, type PlanEmblemFigure } from "./PlanEmblem";

export interface PlanDef {
  id: string;
  name: string;
  figure: PlanEmblemFigure;
  price: string;
  priceUnit?: string;
  annualPrice?: string;
  annualSavingsPct?: number;
  tagline: string;
  features: string[];
  recommended?: boolean;
  isCurrent?: boolean;
}

interface PlanCardProps {
  plan: PlanDef;
}

// One tier card: glass emblem, name, price, a divider, its feature
// list, and a CTA. Deliberately its own "pricing-card" class family
// rather than reusing the app's existing ".plan-card" — AtlasView
// already reuses ".plan-card"/".plan-card-highlighted"/".subscription-
// plans" for its unrelated book-connection tiles, so redesigning those
// classes here would have silently changed that other screen too.
//
// Checkout isn't wired up yet, so every CTA carries a real `disabled`
// attribute (screen readers announce it, not just a faded-looking
// span) — but the card around it still reads as a full premium tier,
// not a "coming soon" placeholder, per the brief.
export function PlanCard({ plan }: PlanCardProps) {
  const cardClassName = [
    "pricing-card",
    plan.recommended ? "pricing-card-recommended" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={cardClassName}>

      {plan.recommended && <span className="pricing-badge">Рекомендуем</span>}

      <PlanEmblem figure={plan.figure} />

      <h3 className="pricing-card-name">{plan.name}</h3>

      <div className="pricing-card-price">
        <span className="pricing-card-price-amount">{plan.price}</span>
        {plan.priceUnit && <span className="pricing-card-price-unit">{plan.priceUnit}</span>}
      </div>

      {plan.annualPrice && (
        <p className="pricing-card-annual">
          {plan.annualPrice}
          {typeof plan.annualSavingsPct === "number" && (
            <span className="pricing-card-annual-save">−{plan.annualSavingsPct}%</span>
          )}
        </p>
      )}

      <p className="pricing-card-tagline">{plan.tagline}</p>

      <span className="pricing-card-divider" aria-hidden="true" />

      <ul className="pricing-card-features">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>

      <button
        type="button"
        className={plan.isCurrent ? "pricing-card-cta pricing-card-cta-current" : "pricing-card-cta"}
        disabled
        aria-disabled="true"
      >
        {plan.isCurrent ? "Текущий план" : "Выбрать план"}
        <span className="sr-only"> — оформление подписки скоро будет доступно</span>
      </button>

    </article>
  );
}
