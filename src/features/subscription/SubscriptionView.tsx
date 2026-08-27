import { useEffect } from "react";
import { ShellPage } from "../shared/ShellPage";
import { PlanCard, type PlanDef } from "./PlanCard";
import "../../styles/pricing.css";

interface SubscriptionViewProps {
  onBack: () => void;
}

// Canonical tier names, prices and entitlements per
// docs/ANKI_PRODUCT_ARCHITECTURE.md (§10-§18, §12 pricing table). Prices
// and the four tier names are frozen there — nothing here is invented.
// Feature lists are trimmed to the 5-8 clearest entitlements per card
// (the full matrix lives in the architecture doc) so a card stays
// readable rather than reproducing every row.
const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    figure: "pawn",
    price: "€0",
    tagline: "Постоянный бесплатный доступ.",
    isCurrent: true,
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

export function SubscriptionView({ onBack }: SubscriptionViewProps) {
  // Account-shell navigation does not use a router, so the browser keeps
  // the previous page's scroll position when switching views. Pricing is
  // a top-level showcase and must always open from its heading rather
  // than half-way through the cards under the fixed global header.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <ShellPage
      onBack={onBack}
      eyebrow="Подписка"
      title="Выберите свой уровень"
      subtitle="Одна библиотека. Несколько уровней интеллекта."
      wide
    >

      <section className="pricing-showcase">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </section>

    </ShellPage>
  );
}
