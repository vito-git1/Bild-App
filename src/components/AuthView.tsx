import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { messageOf } from '../lib/apiClient';
import { login, register, requestPasswordReset, resetPassword } from '../lib/auth';
import type { AuthUser } from '../types';
import { SegmentedControl } from './SegmentedControl';
import { TapeMeasure } from './TapeMeasure';

/** login/register: Umschalter sichtbar; forgot: Mail anfordern; reset: neues Passwort nach dem Mail-Link. */
type Mode = 'login' | 'register' | 'forgot' | 'reset';
type TabMode = 'login' | 'register';

const MODES: Array<{ value: TabMode; label: string }> = [
  { value: 'login', label: 'Anmelden' },
  { value: 'register', label: 'Registrieren' },
];

interface AuthViewProps {
  onAuthenticated: (user: AuthUser) => void;
  /** embedded: als Karte neben der Startseite (kompakter Kopf, ohne Maßband). */
  variant?: 'page' | 'embedded';
  /** Wechselt von außen in einen Modus (z. B. „Kostenlos starten“ → Registrieren); `nonce` erzwingt den Wechsel erneut. */
  request?: { mode: TabMode; nonce: number };
}

interface LinkResult {
  confirmed: boolean;
  recoveryToken: string | null;
  linkError: string | null;
}

/**
 * Liest, was ein Link aus einer Supabase-Mail an die URL hängt (?bestaetigt=1 bzw. #access_token=…&type=recovery
 * oder #error_code=…), und räumt die URL danach auf, damit keine Tokens in der Adresszeile bleiben.
 */
function consumeLinkParams(): LinkResult {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const confirmed = params.has('bestaetigt');
  const recoveryToken = hash.get('type') === 'recovery' ? hash.get('access_token') : null;

  let linkError: string | null = null;
  const errorCode = hash.get('error_code');
  if (errorCode) {
    linkError =
      errorCode === 'otp_expired'
        ? 'Der Link ist abgelaufen oder wurde schon benutzt. Bitte fordere eine neue E-Mail an.'
        : 'Der Link ist ungültig. Bitte fordere eine neue E-Mail an.';
  }

  if (confirmed || window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return { confirmed, recoveryToken, linkError };
}

const TITLES: Record<Mode, { title: string; text: string; submit: string }> = {
  login: { title: 'Willkommen zurück', text: 'Melde dich an, um Kleiderstudio zu nutzen.', submit: 'Anmelden' },
  register: {
    title: 'Konto erstellen',
    text: 'Registriere dich, um Bilder zu generieren und deinen Verlauf zu speichern.',
    submit: 'Registrieren',
  },
  forgot: {
    title: 'Passwort vergessen',
    text: 'Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.',
    submit: 'Link senden',
  },
  reset: { title: 'Neues Passwort', text: 'Wähle ein neues Passwort für dein Konto.', submit: 'Passwort speichern' },
};

export function AuthView({ onAuthenticated, variant = 'page', request }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    const link = consumeLinkParams();
    if (link.recoveryToken) {
      setRecoveryToken(link.recoveryToken);
      setMode('reset');
    } else if (link.linkError) {
      setError(link.linkError);
    } else if (link.confirmed) {
      setNotice('E-Mail bestätigt – du kannst dich jetzt anmelden.');
    }
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  useEffect(() => {
    if (!request) return;
    setMode(request.mode);
    setError(null);
    setNotice(null);
  }, [request]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
        onAuthenticated(await login({ email, password }));
        return;
      }
      if (mode === 'forgot') {
        await requestPasswordReset(email);
        setMode('login');
        setNotice(
          `Falls ein Konto für ${email.trim()} existiert, haben wir dir eine E-Mail mit einem Link geschickt. Bitte prüfe auch den Spam-Ordner.`,
        );
        return;
      }
      if (mode === 'reset') {
        const user = await resetPassword({ accessToken: recoveryToken ?? '', password });
        setRecoveryToken(null);
        setPassword('');
        if (user) {
          onAuthenticated(user);
          return;
        }
        setMode('login');
        setNotice('Passwort geändert – du kannst dich jetzt anmelden.');
        return;
      }
      if (!acceptTerms) {
        setError('Bitte akzeptiere die AGB und die Datenschutzerklärung.');
        return;
      }
      const result = await register({ name, email, password, acceptTerms });
      if (result.user) {
        onAuthenticated(result.user);
        return;
      }
      setPassword('');
      setMode('login');
      setNotice(
        `Wir haben eine E-Mail an ${email.trim()} geschickt. Bitte bestätige deine Adresse über den Link und melde dich dann an.`,
      );
    } catch (submitError) {
      setError(messageOf(submitError, 'Das hat nicht geklappt. Bitte erneut versuchen.'));
    } finally {
      setBusy(false);
    }
  };

  const isRegister = mode === 'register';
  const isTab = mode === 'login' || mode === 'register';
  const needsEmail = mode !== 'reset';
  const needsPassword = mode !== 'forgot';
  const isNewPassword = mode === 'register' || mode === 'reset';
  const texts = TITLES[mode];

  return (
    <div
      className={
        variant === 'page' ? 'mx-auto flex max-w-[420px] flex-col gap-6 pt-8 sm:pt-16' : 'flex w-full flex-col gap-4'
      }
    >
      {variant === 'page' ? (
        <header className="text-center">
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] [font-stretch:80%] sm:text-4xl">{texts.title}</h1>
          <p className="mt-2 text-sm text-muted">{texts.text}</p>
          <TapeMeasure motion="unroll" className="mx-auto mt-5 max-w-[16rem]" />
        </header>
      ) : (
        <header>
          <h2 className="text-2xl font-extrabold tracking-tight">{texts.title}</h2>
          <p className="mt-1 text-sm text-muted">{texts.text}</p>
        </header>
      )}

      <form className="card flex flex-col gap-4 p-5 sm:p-6" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {isTab && (
          <div className="flex justify-center">
            <SegmentedControl
              label="Anmelden oder registrieren"
              options={MODES}
              value={mode as TabMode}
              onChange={switchMode}
            />
          </div>
        )}

        {isRegister && (
          <label className="flex flex-col gap-1.5" htmlFor={`${ids}-name`}>
            <span className="text-sm font-medium">Name</span>
            <input
              id={`${ids}-name`}
              className="input"
              type="text"
              autoComplete="name"
              maxLength={80}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}

        {needsEmail && (
          <label className="flex flex-col gap-1.5" htmlFor={`${ids}-email`}>
            <span className="text-sm font-medium">E-Mail</span>
            <input
              id={`${ids}-email`}
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        )}

        {needsPassword && (
          <label className="flex flex-col gap-1.5" htmlFor={`${ids}-password`}>
            <span className="flex items-center justify-between text-sm font-medium">
              {mode === 'reset' ? 'Neues Passwort' : 'Passwort'}
              {mode === 'login' && (
                <button
                  type="button"
                  className="text-xs font-normal text-muted underline-offset-2 hover:text-fg hover:underline"
                  onClick={() => switchMode('forgot')}
                >
                  Passwort vergessen?
                </button>
              )}
            </span>
            <div className="relative">
              <input
                id={`${ids}-password`}
                className="input pr-10"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isNewPassword ? 'new-password' : 'current-password'}
                minLength={isNewPassword ? 8 : undefined}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            {isNewPassword && <span className="meta">Mindestens 8 Zeichen.</span>}
          </label>
        )}

        {isRegister && (
          <label className="flex items-start gap-2.5 text-sm" htmlFor={`${ids}-terms`}>
            <input
              id={`${ids}-terms`}
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-fg"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              required
            />
            <span>
              Ich bin mindestens 18 Jahre alt und akzeptiere die{' '}
              <a href="/agb" target="_blank" rel="noopener" className="underline underline-offset-2">
                AGB
              </a>
              . Die{' '}
              <a href="/datenschutz" target="_blank" rel="noopener" className="underline underline-offset-2">
                Datenschutzerklärung
              </a>{' '}
              habe ich gelesen.
            </span>
          </label>
        )}

        {error && (
          <p className="animate-slide-down text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="animate-slide-down rounded-lg bg-raised px-3 py-2 text-sm" role="status">
            {notice}
          </p>
        )}

        <button type="submit" className="btn-primary h-10 w-full" disabled={busy}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {texts.submit}
        </button>

        {!isTab && (
          <button
            type="button"
            className="text-sm text-muted underline-offset-2 hover:text-fg hover:underline"
            onClick={() => {
              setRecoveryToken(null);
              switchMode('login');
            }}
          >
            Zurück zur Anmeldung
          </button>
        )}
      </form>
    </div>
  );
}
