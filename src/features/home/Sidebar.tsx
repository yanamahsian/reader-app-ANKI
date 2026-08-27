interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
  onOpenCollections: () => void;
}

export function Sidebar({ isOpen, onClose, onOpenSearch, onOpenCollections }: SidebarProps) {

  return (
    <>
      <aside
        id="siteSidebar"
        className={"site-sidebar" + (isOpen ? " open" : "")}
        aria-label="Основная навигация"
      >

        <button
          className="mobile-menu-close"
          type="button"
          aria-label="Закрыть меню"
          onClick={onClose}
        >
          ×
        </button>

        <a className="brand-lockup" href="#hero" aria-label="AN.KI — главная">
          <span className="brand">AN.KI</span>
        </a>

        <nav className="site-nav">
          <a className="nav-link active" href="#hero">Главная</a>
          <button className="nav-link nav-button" type="button" onClick={onOpenCollections}>
            Подборки
          </button>
          <a className="nav-link" href="#authors">Авторы</a>
          <a className="nav-link" href="#academies">Академии</a>
          <button className="nav-link nav-button" type="button" onClick={onOpenSearch}>
            Поиск
          </button>
        </nav>

        <div className="sidebar-bottom">
          <p>Вне времени.<br />Вне границ. Читай.</p>
          <span>AN.KI · 2026</span>
        </div>

      </aside>

      <div
        className={"sidebar-backdrop" + (isOpen ? "" : " hidden")}
        onClick={onClose}
      />
    </>
  );

}
