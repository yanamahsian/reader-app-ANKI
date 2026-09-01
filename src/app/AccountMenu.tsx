import { signOut, useAuth } from "../auth/supabaseAuth";

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

  // USER LIBRARY PHASE: this used to be a hardcoded `const
  // isAuthenticated = false` with a comment saying a real integration
  // would only need to "flip this one flag ... and feed it a real user
  // object" -- useAuth() (src/auth/supabaseAuth.ts) is exactly that real
  // integration now. Every item below stays reachable either way, same
  // as before -- MyLibraryView/ProfileView still render their own
  // honest state internally rather than being hidden here.
  const { isAuthenticated, user } = useAuth();

  if (!isOpen) return null;

  function go(view: AccountShellView): void {
    onNavigate(view);
    onClose();
  }

  async function handleSignOut(): Promise<void> {
    await signOut();
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
          {isAuthenticated && (
            <button type="button" role="menuitem" onClick={() => void handleSignOut()}>Выйти</button>
          )}
        </div>

      </div>
    </>
  );

}
