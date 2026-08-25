const HERO_COUNT = 45;
const ROTATION_PERIOD_DAYS = 3;

function heroImagePath(n: number): string {
  return `${import.meta.env.BASE_URL}Hero/hero_${n}.webp`;
}

function heroBackground(n: number): string {
  return `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.65)),url("${heroImagePath(n)}")`;
}

// Deterministic, date-based rotation: no timer, no localStorage, no
// backend, no randomness. The image is a pure function of the current
// UTC calendar date, so every reload within the same 3-day window
// resolves to the exact same picture, and it advances sequentially
// (hero_1 → hero_2 → ... → hero_45 → hero_1) every 3 calendar days.
// Using UTC (not local time) means the change happens on the same
// instant for everyone, regardless of the visitor's timezone.
function getCurrentHeroNumber(): number {

  const now = new Date();

  const daysSinceEpoch = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
  );

  const periodIndex = Math.floor(daysSinceEpoch / ROTATION_PERIOD_DAYS);
  const zeroBasedHeroIndex = periodIndex % HERO_COUNT;

  return zeroBasedHeroIndex + 1;

}

interface HeroProps {
  onOpenSearch: () => void;
  onOpenLibrary: () => void;
}

export function Hero({ onOpenSearch, onOpenLibrary }: HeroProps) {

  const heroNumber = getCurrentHeroNumber();

  return (
    <section id="hero" className="hero" aria-label="AN.KI Atlas">

      <div
        className="hero-image active"
        style={{ backgroundImage: heroBackground(heroNumber) }}
      />

      <div className="hero-shade" aria-hidden="true" />

      <div className="hero-topline">
        <span>Цифровая библиотека</span>
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
          <button className="text-link" type="button" onClick={onOpenLibrary}>
            Вся библиотека
          </button>
        </div>

      </div>

    </section>
  );

}
