import type { ReactNode } from "react";
import { GlobalBackground } from "./GlobalBackground";
import { GlobalHeader } from "./GlobalHeader";
import { AccountMenu } from "./AccountMenu";
import type { AccountShellView } from "./AccountMenu";

interface AppShellProps {
  children: ReactNode;
  onNavigateHome: () => void;
  onNavigateLibrary: () => void;
  onNavigateCollections: () => void;
  onOpenSearch: () => void;
  isAccountMenuOpen: boolean;
  onToggleAccountMenu: () => void;
  onCloseAccountMenu: () => void;
  onAccountNavigate: (view: AccountShellView) => void;
}

// The persistent app frame for every screen except Reader (App.tsx
// simply renders <ReaderView/> on its own, with no AppShell at all,
// when view === "reader" — see that file). GlobalBackground and
// GlobalHeader are mounted exactly once here, so navigating between
// Home / Library / Collections / Book Detail / Author Detail / the
// account shells never remounts the photo or the header; only
// {children} (the current screen's own content) swaps out underneath.
export function AppShell({
  children,
  onNavigateHome,
  onNavigateLibrary,
  onNavigateCollections,
  onOpenSearch,
  isAccountMenuOpen,
  onToggleAccountMenu,
  onCloseAccountMenu,
  onAccountNavigate
}: AppShellProps) {

  return (
    <div className="app-shell">

      <GlobalBackground />

      <GlobalHeader
        onNavigateHome={onNavigateHome}
        onNavigateLibrary={onNavigateLibrary}
        onNavigateCollections={onNavigateCollections}
        onOpenSearch={onOpenSearch}
        isAccountMenuOpen={isAccountMenuOpen}
        onToggleAccountMenu={onToggleAccountMenu}
      />

      <AccountMenu
        isOpen={isAccountMenuOpen}
        onClose={onCloseAccountMenu}
        onNavigate={onAccountNavigate}
      />

      <main className="app-shell-content">
        {children}
      </main>

    </div>
  );

}
