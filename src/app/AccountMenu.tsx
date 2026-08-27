import { useAuth } from "../auth/supabaseAuth";

export type AccountShellView =
  | "profile"
  | "my-library"
  | "atlas"
  | "notes"
  | "subscription"
  | "settings"
  | "support";

interface AccountMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: AccountShellView) => void;
}

// Compact dropdown anchored under the header's account icon — not a
// side panel/drawer like SearchPanel, deliberately smaller and lighter
// so it doesn't compete with it.
export function AccountMenu({ isOpen, onClose, onNavigate }: AccountMenuProps) {

  const { isAuthenticated, user } = useAuth();

  if (!isOpen) return null;

  function go(view: AccountShellView): void {
    onNavigate(view);
    onClose();
  }

  return (
    <>
      <div className="account-menu-backdrop" onClick={onClose} />

      <div className="account-menu" role="menu" aria-label="Аккаунт">

        {isAuthenticated && user?.email && (
          <div className="account-menu-identity">
            <p>{user.email}</p>
          </div>
        )}

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
          <button type="button" role="menuitem" onClick={() => go("atlas")}>Atlas</button>
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
