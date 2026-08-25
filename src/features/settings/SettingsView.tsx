import { ShellPage } from "../shared/ShellPage";

interface SettingsViewProps {
  onBack: () => void;
}

// Visual sections only — no new settings backend/storage is wired up
// here. Each control is either a static display (interface language,
// same "RU" badge reasoning as GlobalHeader) or disabled, so nothing
// looks functional without actually being functional.
export function SettingsView({ onBack }: SettingsViewProps) {
  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Настройки">

      <section className="settings-section">
        <h2>Язык интерфейса</h2>
        <p className="settings-section-note">Сейчас интерфейс доступен только на русском.</p>
        <div className="settings-lang-row">
          <span className="settings-lang-chip active">RU</span>
          <span className="settings-lang-chip" aria-disabled="true">EN</span>
        </div>
      </section>

      <section className="settings-section">
        <h2>Reader</h2>
        <p className="settings-section-note">Тема, шрифт и вёрстка настраиваются прямо в режиме чтения.</p>
      </section>

      <section className="settings-section">
        <h2>Приватность и аккаунт</h2>
        <p className="settings-section-note">Появится после подключения авторизации.</p>
        <button type="button" className="text-link" disabled>Управление данными</button>
      </section>

    </ShellPage>
  );
}
