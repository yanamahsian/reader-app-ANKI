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

// PAYMENTS & SUBSCRIPTION LIFECYCLE v1: replaces the old hardcoded
// `disabled` CTA. SubscriptionView (which already owns buildPlans/
// PLAN_DEFS) is the single place that decides what a card's button says
// and does — guest vs authenticated, current vs not, whether a
// non-current paid plan should start a new Paddle checkout (via a
// Paddle.js overlay) or change an existing subscription's plan/interval
// via Paddle's general-availability subscription-update API
// (CORRECTIVE-PASS: never via the Customer Portal, whose own
// upgrade/downgrade UI is Paddle Early Access) — this component stays a
// pure renderer of whatever it's handed, same separation of concerns as
// PLAN_DEFS/buildPlans already established.
export interface PlanCardCta {
  label: string;
  disabled: boolean;
  loading: boolean;
  // "secondary" is the de-emphasised styling for a lower-ranked plan when
  // the visitor already has an active subscription elsewhere (instruction
  // 30: "a lower plan doesn't need a direct downgrade button") — it still
  // calls the same onClick as a "primary" CTA would for that same action,
  // this only changes appearance.
  variant: "primary" | "secondary";
  onClick: (() => void) | null;
}

interface PlanCardProps {
  plan: PlanDef;
  cta: PlanCardCta;
}

// One tier card: glass emblem, name, price, a divider, its feature
// list, and a CTA. Deliberately its own "pricing-card" class family
// rather than reusing the app's existing ".plan-card" — AtlasView
// already reuses ".plan-card"/".plan-card-highlighted"/".subscription-
// plans" for its unrelated book-connection tiles, so redesigning those
// classes here would have silently changed that other screen too.
export function PlanCard({ plan, cta }: PlanCardProps) {
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
        className={[
          "pricing-card-cta",
          plan.isCurrent ? "pricing-card-cta-current" : "",
          cta.variant === "secondary" ? "pricing-card-cta-secondary" : ""
        ].filter(Boolean).join(" ")}
        disabled={cta.disabled}
        aria-disabled={cta.disabled}
        onClick={cta.onClick ?? undefined}
      >
        {cta.loading ? "Оформляем…" : cta.label}
      </button>

    </article>
  );
}
