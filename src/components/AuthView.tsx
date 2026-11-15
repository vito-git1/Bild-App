import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { messageOf } from '../lib/apiClient';
import { login, register } from '../lib/auth';
import type { AuthUser } from '../types';
import { SegmentedControl } from './SegmentedControl';

type Mode = 'login' | 'register';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'login', label: 'Anmelden' },
  { value: 'register', label: 'Registrieren' },
];

interface AuthViewProps {
  onAuthenticated: (user: AuthUser) => void;
}

/** Liest den Hinweis nach dem Bestätigungslink (?bestaetigt=1) und räumt die URL auf. */
function consumeConfirmationFlag(): boolean {
  const params = new URLSearchParams(window.location.search);
  const confirmed = params.has('bestaetigt');
  if (confirmed || window.location.hash) {
    // Supabase hängt Tokens als #fragment an – die werden hier nicht gebraucht.
    window.history.replaceState(null, '', window.location.pathname);
  }
  return confirmed;
}

export function AuthView({ onAuthenticated }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    if (consumeConfirmationFlag()) setNotice('E-Mail bestätigt – du kannst dich jetzt anmelden.');
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

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
      const result = await register({ name, email, password });
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

  return (
    <div className="mx-auto flex max-w-[420px] flex-col gap-6 pt-8 sm:pt-16">
      <header className="text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {isRegister ? 'Konto erstellen' : 'Willkommen zurück'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {isRegister
            ? 'Registriere dich, um Bilder zu generieren und deinen Verlauf zu speichern.'
            : 'Melde dich an, um Kleiderstudio zu nutzen.'}
        </p>
      </header>

      <form className="card flex flex-col gap-4 p-5 sm:p-6" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex justify-center">
          <SegmentedControl label="Anmelden oder registrieren" options={MODES} value={mode} onChange={switchMode} />
        </div>

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

        <label className="flex flex-col gap-1.5" htmlFor={`${ids}-password`}>
          <span className="text-sm font-medium">Passwort</span>
          <div className="relative">
            <input
              id={`${ids}-password`}
              className="input pr-10"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 8 : undefined}
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
          {isRegister && <span className="meta">Mindestens 8 Zeichen.</span>}
        </label>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-raised px-3 py-2 text-sm" role="status">
            {notice}
          </p>
        )}

        <button type="submit" className="btn-primary h-10 w-full" disabled={busy}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {isRegister ? 'Registrieren' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
