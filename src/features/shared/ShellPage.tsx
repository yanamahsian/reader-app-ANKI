import type { ReactNode } from "react";

interface ShellPageProps {
  onBack: () => void;
  backLabel?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  // Opt-in wider content column. Every existing caller omits this and
  // keeps the original 760px reading-width column; only Subscription
  // sets it, so its four-tier pricing showcase has room to breathe
  // without touching the shared frame the other five account screens
  // (Profile, My Library, Notes, Settings, Support) rely on.
  wide?: boolean;
}

// Shared page frame for the six account-area shells (Profile, My
// Library, Notes, Subscription, Settings, Support) — same back button
// + eyebrow + title + optional subtitle header every one of them
// needs, over the shared translucent ".shell-page" surface so
// GlobalBackground shows through consistently instead of six separate
// copies of the same header markup.
export function ShellPage({ onBack, backLabel, eyebrow, title, subtitle, children, wide }: ShellPageProps) {

  return (
    <section className={wide ? "shell-page shell-page-wide" : "shell-page"}>

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
