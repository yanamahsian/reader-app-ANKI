import { useEffect, useState } from "react";
import { ShellPage } from "../shared/ShellPage";
import { PlanCard, type PlanDef, type PlanCardCta } from "./PlanCard";
import { useAuth } from "../../auth/supabaseAuth";
import { getMyEntitlementSnapshot, type EffectivePlan } from "../../api/aiEntitlements";
import {
  getMyBillingSnapshot,
  createPaddleCheckout,
  createPaddleManagePortalSession,
  BillingError,
  describeBillingErrorRu,
  type BillingSnapshot,
  type PaddlePlan,
  type PaddleInterval
} from "../../api/paddleBilling";
import "../../styles/pricing.css";

interface SubscriptionViewProps {
  onBack: () => void;
  // PAYMENTS & SUBSCRIPTION LIFECYCLE v1: same "route a guest to the real
  // sign-in surface (ProfileView)" callback MyLibraryView/AtlasView/
  // NotesView already receive from App.tsx -- used by a guest's paid-plan
  // CTA (instruction 30's "Sign in and subscribe") instead of inventing a
  // second auth-prompt mechanism.
  onRequireSignIn: () => void;
}

// SUBSCRIPTION & AI ENTITLEMENTS FOUNDATION v1: which card is marked
// "current" now comes from a real loaded effective plan (via the new
// get_my_entitlement_snapshot() RPC) instead of being hardcoded to Free.
//   - Guest: baseline Free access is shown as a courtesy, with zero
//     network entitlement requests (there is no account to query).
//   - Authenticated, snapshot loaded: the server's own effective plan.
//   - Authenticated, snapshot failed to load: null -- no card is marked
//     current. A load failure must never be silently presented as "you
//     are on Free" for a visitor who may actually hold a paid plan.
//
// This remains the SOLE source of truth for "what plan does this visitor
// actually have" -- unchanged by this pass. A Paddle subscription is only
// ONE possible source feeding effective_plan_for_user() (source='paddle');
// trial/pass_it_forward/founding/manual sources stay just as authoritative
// (instruction 41, Entitlement interaction C) -- this is exactly why
// "current plan" is never derived from the new billing snapshot below.
type SnapshotState =
  | { status: "guest" }
  | { status: "loading" }
  | { status: "loaded"; plan: EffectivePlan }
  | { status: "error" };

// PAYMENTS & SUBSCRIPTION LIFECYCLE v1: a second, independent load for the
// new get_my_billing_snapshot() RPC -- purely for CTA wording (checkout vs
// "manage in Paddle Portal") and the small billing-status panel below the
// toggle. Never consulted for "isCurrent" (see SnapshotState's own
// comment) and never used to grant/imply a plan by itself.
type BillingSnapshotState =
  | { status: "guest" }
  | { status: "loading" }
  | { status: "loaded"; snapshot: BillingSnapshot }
  | { status: "error" };

// Canonical tier names, prices and entitlements per
// docs/ANKI_PRODUCT_ARCHITECTURE.md (§10-§18, §12 pricing table). Prices
// and the four tier names are frozen there — nothing here is invented.
// Feature lists are trimmed to the 5-8 clearest entitlements per card
// (the full matrix lives in the architecture doc) so a card stays
// readable rather than reproducing every row.
//
// isCurrent is now a function of the real loaded plan (see
// SnapshotState above) rather than a hardcoded field on each entry --
// buildPlans() below stamps it on per-render.
const PLAN_DEFS: Omit<PlanDef, "isCurrent">[] = [
  {
    id: "free",
    name: "Free",
    figure: "pawn",
    price: "€0",
    tagline: "Постоянный бесплатный доступ.",
    features: [
      "Личная библиотека AN.KI — ограниченная подборка",
      "Базовый Reader и прогресс чтения",
      "Закладки",
      "Базовые выделения и заметки",
      "Ограниченные Translate, Explain и Reveal",
      "Превью Atlas",
    ],
  },
  {
    id: "library",
    name: "Library",
    figure: "knight",
    price: "€14.90",
    priceUnit: "/ мес.",
    annualPrice: "€129 / год",
    annualSavingsPct: 28,
    tagline: "Полноценная среда для чтения AN.KI.",
    features: [
      "Всё из Free",
      "Полный доступный каталог AN.KI",
      "Полный Reader и персональная библиотека",
      "Расширенные заметки, выделения и коллекции",
      "Импорт личных EPUB, PDF и FB2 (где поддерживается)",
      "Синхронизация на всех устройствах",
      "Translate, Explain и Ask Book",
    ],
  },
  {
    id: "atlas",
    name: "Atlas",
    figure: "bust",
    price: "€24.90",
    priceUnit: "/ мес.",
    annualPrice: "€219 / год",
    annualSavingsPct: 27,
    tagline: "AN.KI запоминает и выстраивает вашу интеллектуальную историю чтения.",
    recommended: true,
    features: [
      "Всё из Library",
      "Персональный интеллектуальный граф чтения",
      "Связи между книгами, авторами, идеями и эпохами",
      "Тематические линии через всё прочитанное",
      "Вопросы и поиск по собственной библиотеке",
      "Сравнения и противоречия между авторами",
      "Незавершённые линии мысли возвращаются сами",
    ],
  },
  {
    id: "academy",
    name: "Academy",
    figure: "queen",
    price: "€39.90",
    priceUnit: "/ мес.",
    annualPrice: "€349 / год",
    annualSavingsPct: 27,
    tagline: "Прочитанное становится структурированным образованием.",
    features: [
      "Всё из Atlas",
      "Структурированные образовательные маршруты",
      "Философия, литература, история искусства, архитектура и другие дисциплины",
      "Курируемые программы: первичные и вторичные источники",
      "Определение пробелов и последовательности изучения",
      "Адаптивные траектории обучения на основе Atlas",
      "Прогресс по каждой дисциплине",
    ],
  },
];

const PLAN_RANK: Record<string, number> = { free: 0, library: 1, atlas: 2, academy: 3 };

// Stamps isCurrent onto each plan definition from the real loaded plan
// id (or leaves every card un-marked when there isn't one yet/it failed
// to load) -- a pure function so it's trivially testable on its own,
// independent of the snapshot-loading effect below.
function buildPlans(currentPlanId: EffectivePlan | null): PlanDef[] {
  return PLAN_DEFS.map(plan => ({ ...plan, isCurrent: plan.id === currentPlanId }));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

// Sentinel pendingPlanId value for the standalone "Manage subscription"
// action (the status panel's own button, and every per-card CTA that also
// routes to the Portal) -- distinct from any real plan id so a checkout in
// progress for one plan never shows as "loading" on an unrelated card.
const MANAGE_PENDING_ID = "__manage__";

export function SubscriptionView({ onBack, onRequireSignIn }: SubscriptionViewProps) {
  const { isAuthenticated } = useAuth();
  const [snapshotState, setSnapshotState] = useState<SnapshotState>(
    isAuthenticated ? { status: "loading" } : { status: "guest" }
  );
  const [billingState, setBillingState] = useState<BillingSnapshotState>(
    isAuthenticated ? { status: "loading" } : { status: "guest" }
  );

  // Named billingInterval/setBillingInterval (not interval/setInterval)
  // deliberately -- setInterval would shadow the global timer function of
  // the same name, which is an easy, confusing mistake to make later in a
  // file that also uses setTimeout.
  const [billingInterval, setBillingInterval] = useState<PaddleInterval>("month");
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // PAYMENTS & SUBSCRIPTION LIFECYCLE v1, instruction 4/32: Paddle's
  // hosted checkout redirects the browser back to exactly this URL
  // (`/subscription?checkout=success`) -- App.tsx's own mount effect
  // already routes `view` to "subscription" for this, but never touches
  // the query string itself (see that effect's own comment) specifically
  // so this component can read it once, here, on ITS OWN mount. The flag
  // is derived once from the real URL, then the URL is scrubbed
  // immediately below -- never re-derived from sessionStorage-restored
  // `view` state, so navigating away and back to this screen later in the
  // same session does not re-trigger the confirmation flow.
  const [justCompletedCheckout] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("checkout") === "success";
  });
  const [postCheckoutState, setPostCheckoutState] = useState<"none" | "confirming" | "timed_out">(
    justCompletedCheckout ? "confirming" : "none"
  );

  useEffect(() => {
    if (!justCompletedCheckout) return;
    // This is optimistic UX only -- instruction 4 is explicit that a
    // checkout-success redirect is never proof of payment and must never
    // grant a plan locally. Scrubbing the query string here (once) is
    // purely so a manual refresh of this screen later doesn't replay the
    // confirmation banner/polling for an already-settled subscription.
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Account-shell navigation does not use a router, so the browser keeps
  // the previous page's scroll position when switching views. Pricing is
  // a top-level showcase and must always open from its heading rather
  // than half-way through the cards under the fixed global header.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      // Guest path: zero network entitlement requests. Guest still sees
      // baseline Free access reflected as "current" -- see SnapshotState's
      // own comment -- purely a local, no-fetch courtesy.
      setSnapshotState({ status: "guest" });
      return;
    }

    setSnapshotState({ status: "loading" });

    getMyEntitlementSnapshot()
      .then(snapshot => {
        if (cancelled) return;
        setSnapshotState({ status: "loaded", plan: snapshot.effectivePlan });
      })
      .catch(loadError => {
        if (cancelled) return;
        console.error("SubscriptionView: getMyEntitlementSnapshot failed:", loadError);
        setSnapshotState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setBillingState({ status: "guest" });
      return;
    }

    setBillingState({ status: "loading" });

    getMyBillingSnapshot()
      .then(snapshot => {
        if (cancelled) return;
        setBillingState({ status: "loaded", snapshot });
      })
      .catch(loadError => {
        if (cancelled) return;
        console.error("SubscriptionView: getMyBillingSnapshot failed:", loadError);
        setBillingState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Instruction 32: post-checkout, refetch a BOUNDED number of times (here:
  // an initial wait plus 3 retries with growing delays) -- never infinite
  // polling. Stops as soon as the billing snapshot shows a real active/
  // trialing subscription (the webhook landed); otherwise gives up after
  // the last retry and shows the honest "will update once confirmed"
  // message, never a locally-guessed plan.
  useEffect(() => {
    if (postCheckoutState !== "confirming" || !isAuthenticated) return;

    let cancelled = false;
    const delaysMs = [2000, 3000, 5000];

    async function poll(): Promise<void> {
      for (const delay of delaysMs) {
        await new Promise(resolve => setTimeout(resolve, delay));
        if (cancelled) return;

        try {
          const [entitlement, billing] = await Promise.all([getMyEntitlementSnapshot(), getMyBillingSnapshot()]);
          if (cancelled) return;
          setSnapshotState({ status: "loaded", plan: entitlement.effectivePlan });
          setBillingState({ status: "loaded", snapshot: billing });
          if (billing.hasSubscription && (billing.status === "active" || billing.status === "trialing")) {
            setPostCheckoutState("none");
            return;
          }
        } catch (pollError) {
          // A single transient failure never aborts the bounded retry
          // loop early -- it simply tries again on the next scheduled
          // delay, same as any other retry here.
          console.error("SubscriptionView: post-checkout poll failed:", pollError);
        }
      }
      if (!cancelled) setPostCheckoutState("timed_out");
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [postCheckoutState, isAuthenticated]);

  const currentPlanId: EffectivePlan | null =
    snapshotState.status === "guest"
      ? "free"
      : snapshotState.status === "loaded"
        ? snapshotState.plan
        : null;

  async function handleChoosePlan(plan: PaddlePlan): Promise<void> {
    setActionError(null);
    setPendingPlanId(plan);
    try {
      const result = await createPaddleCheckout(plan, billingInterval);
      if (result.checkoutUrl) {
        // Full-page navigation to Paddle's own hosted checkout -- this
        // component intentionally does nothing further here; the pending
        // state is left as-is because the page is about to leave anyway,
        // and instruction 4 forbids treating this call's own success as
        // proof of anything.
        window.location.href = result.checkoutUrl;
        return;
      }
      console.error("createPaddleCheckout succeeded but returned no checkoutUrl");
      setActionError("Не удалось открыть страницу оплаты.");
      setPendingPlanId(null);
    } catch (checkoutError) {
      setPendingPlanId(null);
      if (checkoutError instanceof BillingError) {
        if (checkoutError.kind === "auth_required") {
          onRequireSignIn();
          return;
        }
        // Instruction 33: existing Free/product functionality keeps
        // working regardless -- only this one action fails, with an
        // honest message.
        setActionError(describeBillingErrorRu(checkoutError.kind));
        return;
      }
      console.error("createPaddleCheckout failed:", checkoutError);
      setActionError("Не удалось начать оформление подписки.");
    }
  }

  async function handleManageSubscription(): Promise<void> {
    setActionError(null);
    setPendingPlanId(MANAGE_PENDING_ID);
    try {
      const portalUrl = await createPaddleManagePortalSession();
      window.location.href = portalUrl;
    } catch (portalError) {
      setPendingPlanId(null);
      if (portalError instanceof BillingError) {
        if (portalError.kind === "auth_required") {
          onRequireSignIn();
          return;
        }
        setActionError(describeBillingErrorRu(portalError.kind));
        return;
      }
      console.error("createPaddleManagePortalSession failed:", portalError);
      setActionError("Не удалось открыть управление подпиской.");
    }
  }

  // Instruction 30's full CTA-state matrix, resolved once per card, per
  // render: guest / authenticated+free / authenticated+current /
  // authenticated+higher(upgrade) / authenticated+lower(manage, de-
  // emphasised). See this file's own header comments on handleChoosePlan/
  // handleManageSubscription for what each onClick actually does.
  function resolveCta(planDef: Omit<PlanDef, "isCurrent">): PlanCardCta {
    if (planDef.id === "free") {
      if (currentPlanId === "free" || currentPlanId === null) {
        return { label: "Текущий план", disabled: true, loading: false, variant: "primary", onClick: null };
      }
      // A paid subscriber's Free card is purely informational -- instruction
      // 30 explicitly does not require a direct downgrade-to-free button
      // here; that path is Manage Subscription (cancel) via the Portal.
      return { label: "Бесплатный план", disabled: true, loading: false, variant: "primary", onClick: null };
    }

    if (!isAuthenticated) {
      return {
        label: "Войти и оформить подписку",
        disabled: false,
        loading: false,
        variant: "primary",
        onClick: onRequireSignIn
      };
    }

    if (planDef.id === currentPlanId) {
      return { label: "Текущий план", disabled: true, loading: false, variant: "primary", onClick: null };
    }

    if (billingState.status === "loading") {
      // Deliberately disabled rather than defaulting to a "Choose" CTA
      // while it's still unknown whether this visitor already has an
      // active Paddle subscription -- guessing wrong here could start a
      // second, parallel checkout instead of routing to the Portal
      // (instruction 21-22).
      return { label: "Загрузка…", disabled: true, loading: false, variant: "primary", onClick: null };
    }

    const manageAvailable = billingState.status === "loaded" && billingState.snapshot.manageSubscriptionAvailable;
    const managing = pendingPlanId === MANAGE_PENDING_ID;

    if (manageAvailable) {
      const isUpgrade = (PLAN_RANK[planDef.id] ?? 0) > (PLAN_RANK[currentPlanId ?? "free"] ?? 0);
      return {
        label: isUpgrade ? `Улучшить до ${planDef.name}` : "Изменить в личном кабинете",
        disabled: managing,
        loading: managing,
        variant: isUpgrade ? "primary" : "secondary",
        onClick: () => void handleManageSubscription()
      };
    }

    const choosingThisPlan = pendingPlanId === planDef.id;
    return {
      label: `Выбрать ${planDef.name}`,
      disabled: choosingThisPlan,
      loading: choosingThisPlan,
      variant: "primary",
      onClick: () => void handleChoosePlan(planDef.id as PaddlePlan)
    };
  }

  const plans = buildPlans(currentPlanId);

  return (
    <ShellPage
      onBack={onBack}
      eyebrow="Подписка"
      title="Выберите свой уровень"
      subtitle="Одна библиотека. Несколько уровней интеллекта."
      wide
    >

      {snapshotState.status === "error" && (
        <p className="settings-section-note">
          Не удалось загрузить ваш текущий план. Обновите страницу, чтобы попробовать снова.
        </p>
      )}

      {postCheckoutState === "confirming" && (
        <p className="settings-section-note">
          Оплата подтверждается… Это обычно занимает несколько секунд.
        </p>
      )}

      {postCheckoutState === "timed_out" && (
        <p className="settings-section-note">
          Оплата получена. Доступ обновится после подтверждения от Paddle — обновите страницу через минуту, если план ещё не изменился.
        </p>
      )}

      {actionError && <p className="notes-card-error">{actionError}</p>}

      {isAuthenticated && billingState.status === "loaded" && billingState.snapshot.hasSubscription && (
        <div className="pricing-billing-status">
          <p>
            Оплата через <strong>Paddle</strong>
            {billingState.snapshot.cancelAtPeriodEnd && billingState.snapshot.renewsAt
              ? <> · подписка отменена — доступ сохранится до {formatDate(billingState.snapshot.renewsAt)}</>
              : billingState.snapshot.renewsAt
                ? <> · продление {formatDate(billingState.snapshot.renewsAt)}</>
                : null}
            {billingState.snapshot.status === "past_due" && (
              <> · есть проблема с последним платежом, Paddle повторит попытку — доступ пока сохраняется</>
            )}
          </p>
          {billingState.snapshot.manageSubscriptionAvailable && (
            <div className="notes-card-actions">
              <button
                type="button"
                className="text-link"
                disabled={pendingPlanId === MANAGE_PENDING_ID}
                onClick={() => void handleManageSubscription()}
              >
                {pendingPlanId === MANAGE_PENDING_ID ? "Открываем…" : "Управление подпиской"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="pricing-interval-toggle" role="group" aria-label="Период оплаты">
        <button type="button" aria-pressed={billingInterval === "month"} onClick={() => setBillingInterval("month")}>
          Помесячно
        </button>
        <button type="button" aria-pressed={billingInterval === "year"} onClick={() => setBillingInterval("year")}>
          Ежегодно
        </button>
      </div>

      <section className="pricing-showcase">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cta={resolveCta(plan)} />
        ))}
      </section>

    </ShellPage>
  );
}
