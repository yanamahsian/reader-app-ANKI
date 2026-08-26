import { useState } from "react";
import type { FormEvent } from "react";
import { ShellPage } from "../shared/ShellPage";
import { useAuth, signIn, signUp, signOut } from "../../auth/supabaseAuth";

interface ProfileViewProps {
  onBack: () => void;
}

type Mode = "sign-in" | "sign-up";
type FormStatus = "idle" | "submitting" | "confirmation-required";

// USER LIBRARY PHASE: this used to always render a guest placeholder
// with a comment saying "once real auth exists, the guest branch below
// is what gets replaced with an actual profile" -- this is that
// replacement. The page frame (ShellPage) and navigation entry point
// were already in place and are unchanged; only the body is real now.
// This is the one and only place in the app with an actual sign-in/
// sign-up form -- AccountMenu's guest buttons and BookDetailView's
// "Добавить в библиотеку" (when signed out) both route here rather
// than duplicating a form of their own, per requirement #4 ("не
// создавай новую отдельную auth-систему").
export function ProfileView({ onBack }: ProfileViewProps) {

  const { isAuthenticated, user } = useAuth();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {

    event.preventDefault();
    setError(null);
    setStatus("submitting");

    try {

      if (mode === "sign-up") {
        const result = await signUp(email, password);
        if (result.outcome === "confirmation_required") {
          setStatus("confirmation-required");
          return;
        }
      } else {
        await signIn(email, password);
      }

      setEmail("");
      setPassword("");
      setStatus("idle");

    } catch (submitError) {
      setError((submitError as Error).message);
      setStatus("idle");
    }

  }

  function switchMode(nextMode: Mode): void {
    setMode(nextMode);
    setError(null);
    setStatus("idle");
  }

  if (isAuthenticated && user) {
    return (
      <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Профиль">
        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">
            {(user.email ?? "?").charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="profile-name-placeholder">{user.email ?? "Без e-mail"}</p>
            <p className="profile-email-placeholder">Аккаунт подтверждён</p>
          </div>
        </div>
        <button type="button" className="text-link" onClick={() => signOut()}>
          Выйти
        </button>
      </ShellPage>
    );
  }

  return (
    <ShellPage onBack={onBack} eyebrow="Аккаунт" title="Профиль">

      <div className="profile-identity">
        <span className="profile-avatar" aria-hidden="true">?</span>
        <div>
          <p className="profile-name-placeholder">Гость</p>
          <p className="profile-email-placeholder">Аккаунт не создан</p>
        </div>
      </div>

      <div className="profile-auth-form-wrap">

        <div className="profile-auth-tabs">
          <button
            type="button"
            className={mode === "sign-in" ? "profile-auth-tab profile-auth-tab-active" : "profile-auth-tab"}
            onClick={() => switchMode("sign-in")}
          >
            Войти
          </button>
          <button
            type="button"
            className={mode === "sign-up" ? "profile-auth-tab profile-auth-tab-active" : "profile-auth-tab"}
            onClick={() => switchMode("sign-up")}
          >
            Создать аккаунт
          </button>
        </div>

        {status === "confirmation-required" ? (
          <p className="profile-auth-note">
            Аккаунт создан. Проверьте почту {email} и подтвердите e-mail, чтобы войти.
          </p>
        ) : (
          <form className="profile-auth-form" onSubmit={handleSubmit}>

            <label htmlFor="profileEmail">E-mail</label>
            <input
              id="profileEmail"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
            />

            <label htmlFor="profilePassword">Пароль</label>
            <input
              id="profilePassword"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={event => setPassword(event.target.value)}
            />

            {error && <p className="profile-auth-error">{error}</p>}

            <button className="primary-button" type="submit" disabled={status === "submitting"}>
              {status === "submitting"
                ? "Секунду…"
                : mode === "sign-up" ? "Создать аккаунт" : "Войти"}
            </button>

          </form>
        )}

      </div>

    </ShellPage>
  );

}
