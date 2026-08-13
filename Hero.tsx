import { useEffect, useState } from "react";

const HERO_COUNT = 45;
const HERO_DELAY = 7000;

function heroImagePath(n: number): string {
  return `${import.meta.env.BASE_URL}Hero/hero_${n}.png`;
}

function heroBackground(n: number): string {
  return `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.65)),url("${heroImagePath(n)}")`;
}

interface HeroProps {
  onOpenSearch: () => void;
}

// Same crossfade approach as the original vanilla implementation: two
// persistent layers (A/B), the inactive one gets the next image applied
// before it becomes active, so the CSS opacity transition on
// .hero-image.active still runs.
export function Hero({ onOpenSearch }: HeroProps) {

  const initialIndex = () => Math.floor(Math.random() * HERO_COUNT);

  const [slotAIndex, setSlotAIndex] = useState<number>(initialIndex);
  const [slotBIndex, setSlotBIndex] = useState<number>(initialIndex);
  const [activeSlot, setActiveSlot] = useState<"A" | "B">("A");
  const [displayIndex, setDisplayIndex] = useState<number>(() => slotAIndex);

  function rotateTo(nextIndex: number): void {
    if (activeSlot === "A") {
      setSlotBIndex(nextIndex);
      setActiveSlot("B");
    } else {
      setSlotAIndex(nextIndex);
      setActiveSlot("A");
    }
    setDisplayIndex(nextIndex);
  }

  function rotateRandom(): void {
    let next = displayIndex;
    while (next === displayIndex) {
      next = Math.floor(Math.random() * HERO_COUNT);
    }
    rotateTo(next);
  }

  function goNext(): void {
    rotateTo((displayIndex + 1) % HERO_COUNT);
  }

  function goPrevious(): void {
    rotateTo((displayIndex - 1 + HERO_COUNT) % HERO_COUNT);
  }

  useEffect(() => {
    for (let i = 1; i <= HERO_COUNT; i++) {
      const img = new Image();
      img.src = heroImagePath(i);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(rotateRandom, HERO_DELAY);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayIndex, activeSlot]);

  const counter = `${String(displayIndex + 1).padStart(2, "0")} / ${String(HERO_COUNT).padStart(2, "0")}`;

  return (
    <section id="hero" className="hero" aria-label="AN.KI Atlas">

      <div
        className={"hero-image hero-image-a" + (activeSlot === "A" ? " active" : "")}
        style={{ backgroundImage: heroBackground(slotAIndex) }}
      />

      <div
        className={"hero-image hero-image-b" + (activeSlot === "B" ? " active" : "")}
        style={{ backgroundImage: heroBackground(slotBIndex) }}
      />

      <div className="hero-shade" aria-hidden="true" />

      <div className="hero-topline">
        <span>Цифровая библиотека</span>
        <span>{counter}</span>
      </div>

      <div className="hero-content">

        <p className="eyebrow">AN.KI ATLAS</p>

        <h1>
          Вся мировая литература.<br />
          В одном пространстве.
        </h1>

        <p className="hero-copy">
          Читайте книги на языке оригинала или в переводе.
          Выделяйте сложные фрагменты и получайте объяснение,
          не покидая текст.
        </p>

        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={onOpenSearch}>
            Найти книгу
          </button>
          <a className="text-link" href="#collections">Открыть подборки</a>
        </div>

      </div>

      <div className="hero-controls" aria-label="Управление изображениями">
        <button type="button" aria-label="Предыдущее изображение" onClick={goPrevious}>←</button>
        <button type="button" aria-label="Следующее изображение" onClick={goNext}>→</button>
      </div>

    </section>
  );

}
