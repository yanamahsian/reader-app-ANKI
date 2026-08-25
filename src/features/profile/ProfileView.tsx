import { ShellPage } from "../shared/ShellPage";
import { GuestNotice } from "../shared/GuestNotice";

interface ProfileViewProps {
  onBack: () => void;
}

// Visual shell only — no Supabase Auth session exists to read a real
// identity from, so this always renders the guest state. Once real
// auth exists, the guest branch below is what gets replaced with an
// actual profile (name, email, avatar, reading stats); the page frame
// and navigation entry point are already in place.
export function ProfileView({ onBack }: ProfileViewProps) {
  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Профиль">
      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">?</span>
        <div>
          <p className="profile-name-placeholder">Гость</p>
          <p className="profile-email-placeholder">Аккаунт не создан</p>
        </div>
      </div>
      <GuestNotice message="После входа здесь появятся ваши данные, история чтения и настройки аккаунта." />
    </ShellPage>
  );
}
