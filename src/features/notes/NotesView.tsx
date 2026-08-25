import { ShellPage } from "../shared/ShellPage";
import { GuestNotice } from "../shared/GuestNotice";

interface NotesViewProps {
  onBack: () => void;
}

// Visual shell only, same reasoning as MyLibraryView.tsx — no account,
// so no notes store to read from yet.
export function NotesView({ onBack }: NotesViewProps) {
  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Заметки">
      <GuestNotice message="Здесь появятся ваши заметки." />
    </ShellPage>
  );
}
