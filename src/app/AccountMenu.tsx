export type AccountShellView =
  | "profile"
  | "my-library"
  | "notes"
  | "subscription"
  | "settings"
  | "support";

interface AccountMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: AccountShellView) => void;
}

// No real Supabase Auth exists yet — this is deliberately hardcoded
// false, not read from any store. The point of this component is that
// the visual/navigation architecture for an account exists now, so a
// real auth integration later only has to flip this one flag (and feed
// it a real user object) rather than build the menu from scratch. Every
// item below stays reachable either way — MyLibraryView/NotesView/
// ProfileView each render their own honest "not signed in yet" empty
// state internally (see those files) rather than being hidden here,
// so this pass's new shells are actually visitable for review.
const isAuthenticated = false;

// Compact dropdown anchored under the header's account icon — not a
// side panel/drawer like SearchPanel, deliberately smaller and lighter
// so it doesn't compete with it.
export function AccountMenu({ isOpen, onClose, onNavigate }: AccountMenuProps) {

  if (!isOpen) return null;

  function go(view: AccountShellView): void {
    onNavigate(view);
    onClose();
  }

  return (
    <>
      <div className="account-menu-backdrop" onClick={onClose} />

      <div className="account-menu" role="menu" aria-label="Аккаунт">

        {!isAuthenticated && (
          <div className="account-menu-guest">
            <p>Вы не авторизованы</p>
            <div className="account-menu-guest-actions">
              <button type="button" className="primary-button" onClick={() => go("profile")}>
                Создать аккаунт
              </button>
              <button type="button" className="text-link" onClick={() => go("profile")}>
                Войти
              </button>
            </div>
          </div>
        )}

        <div className="account-menu-list">
          <button type="button" role="menuitem" onClick={() => go("my-library")}>Моя библиотека</button>
          <button type="button" role="menuitem" onClick={() => go("notes")}>Заметки</button>
          <button type="button" role="menuitem" onClick={() => go("profile")}>Профиль</button>
          <button type="button" role="menuitem" onClick={() => go("subscription")}>Подписка</button>
          <button type="button" role="menuitem" onClick={() => go("settings")}>Настройки</button>
          <button type="button" role="menuitem" onClick={() => go("support")}>Помощь и поддержка</button>
        </div>

      </div>
    </>
  );

}
