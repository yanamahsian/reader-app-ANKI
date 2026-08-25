import { ShellPage } from "../shared/ShellPage";
import { GuestNotice } from "../shared/GuestNotice";

interface MyLibraryViewProps {
  onBack: () => void;
}

// Visual shell only. "My Library" (saved/shelved books tied to a real
// account) is a different concept from the public catalog Library
// (features/library/LibraryView.tsx) — this page is not a redesign of
// that one, it's the future personal-shelf page, currently always
// showing its empty/guest state since there is no account to hold a
// shelf yet.
export function MyLibraryView({ onBack }: MyLibraryViewProps) {
  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Моя библиотека">
      <GuestNotice message="Здесь появятся сохранённые книги." />
    </ShellPage>
  );
}
