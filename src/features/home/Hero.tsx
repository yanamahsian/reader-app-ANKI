interface HeroProps {
  onOpenSearch: () => void;
  onOpenLibrary: () => void;
}

// The hero photo itself (image + darkening shade) used to be rendered
// right here. It's now rendered once, app-wide, by GlobalBackground
// (src/app/GlobalBackground.tsx), using the same rotation logic moved
// into the shared src/app/hero.ts module -- so Home and every other
// non-Reader screen always show the exact same photo instead of each
// screen picking its own. This component keeps only the text overlay
// that sits on top of that shared background.
export function Hero({ onOpenSearch, onOpenLibrary }: HeroProps) {

  return (
    <section id="hero" className="hero" aria-label="AN.KI">

      <div className="hero-topline">
        <span>Цифровая библиотека</span>
      </div>

      <div className="hero-content">

        <p className="eyebrow">AN.KI</p>

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
