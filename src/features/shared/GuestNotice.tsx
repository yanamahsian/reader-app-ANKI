interface GuestNoticeProps {
  message: string;
}

// Shown on My Library / Notes (and inside Profile's own guest state)
// while there is no real Supabase Auth wired up yet. Buttons are
// disabled rather than silently doing nothing on click — same
// principle as Subscription's "Скоро" plans: a control that looks
// clickable but has no effect reads as broken, an explicitly disabled
// one reads as "not built yet, on purpose".
export function GuestNotice({ message }: GuestNoticeProps) {
  return (
    <div className="guest-notice">
      <p className="guest-notice-message">{message}</p>
      <div className="guest-notice-actions">
        <button type="button" className="primary-button" disabled>Создать аккаунт</button>
        <button type="button" className="text-link" disabled>Войти</button>
      </div>
      <p className="guest-notice-note">Авторизация появится в одном из следующих обновлений.</p>
    </div>
  );
}
