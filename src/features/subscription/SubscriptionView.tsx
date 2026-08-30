import { useEffect, useState } from "react";
import { ShellPage } from "../shared/ShellPage";
import { PlanCard, type PlanDef } from "./PlanCard";
import { useAuth } from "../../auth/supabaseAuth";
import { getMyEntitlementSnapshot, type EffectivePlan } from "../../api/aiEntitlements";
import "../../styles/pricing.css";

interface SubscriptionViewProps {
  onBack: () => void;
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
type SnapshotState =
  | { status: "guest" }
  | { status: "loading" }
  | { status: "loaded"; plan: EffectivePlan }
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

// Stamps isCurrent onto each plan definition from the real loaded plan
// id (or leaves every card un-marked when there isn't one yet/it failed
// to load) -- a pure function so it's trivially testable on its own,
// independent of the snapshot-loading effect below.
function buildPlans(currentPlanId: EffectivePlan | null): PlanDef[] {
  return PLAN_DEFS.map(plan => ({ ...plan, isCurrent: plan.id === currentPlanId }));
}

export function SubscriptionView({ onBack }: SubscriptionViewProps) {
  const { isAuthenticated } = useAuth();
  const [snapshotState, setSnapshotState] = useState<SnapshotState>(
    isAuthenticated ? { status: "loading" } : { status: "guest" }
  );

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

  const currentPlanId: EffectivePlan | null =
    snapshotState.status === "guest"
      ? "free"
      : snapshotState.status === "loaded"
        ? snapshotState.plan
        : null;

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

      <section className="pricing-showcase">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </section>

    </ShellPage>
  );
}
