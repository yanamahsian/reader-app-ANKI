import type { ReactNode } from "react";

interface ShellPageProps {
  onBack: () => void;
  backLabel?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

// Shared page frame for the six account-area shells (Profile, My
// Library, Notes, Subscription, Settings, Support) — same back button
// + eyebrow + title + optional subtitle header every one of them
// needs, over the shared translucent ".shell-page" surface so
// GlobalBackground shows through consistently instead of six separate
// copies of the same header markup.
export function ShellPage({ onBack, backLabel, eyebrow, title, subtitle, children }: ShellPageProps) {

  return (
    <section className="shell-page">

      <button className="text-link" type="button" onClick={onBack}>
        {backLabel ?? "← Назад"}
      </button>

      <header className="shell-page-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {subtitle && <p className="shell-page-subtitle">{subtitle}</p>}
      </header>

      <div className="shell-page-body">
        {children}
      </div>

    </section>
  );

}
