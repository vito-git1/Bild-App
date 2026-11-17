import { Check } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { MARKETING } from '../config';
import type { AuthUser } from '../types';
import { AuthView } from './AuthView';
import { CompareSlider } from './CompareSlider';
import { TapeMeasure } from './TapeMeasure';

const DEMO = {
  person: '/samples/person.svg',
  garment: '/samples/garment.svg',
  result: '/samples/result.svg',
  width: 768,
  height: 1024,
};

const STEPS = [
  { title: 'Foto von dir', text: 'Ganzkörper, gerade stehend, gutes Licht. Ein Handyfoto reicht.' },
  { title: 'Das Kleidungsstück', text: 'Ein Foto vom Teil oder einfach ein Screenshot aus dem Online-Shop.' },
  { title: 'Anprobieren', text: 'Nach etwa einer Minute siehst du dich darin – und vergleichst direkt mit dem Original.' },
];

const FAQ = [
  {
    q: 'Was passiert mit meinen Fotos?',
    a: 'Sie werden nur für deine Anprobe verarbeitet und in deinem Verlauf gespeichert, den nur du siehst. Jeden Eintrag kannst du jederzeit löschen.',
  },
  {
    q: 'Brauche ich eine App?',
    a: 'Nein. Kleiderstudio läuft im Browser, auf dem Handy genauso wie am Computer.',
  },
  {
    q: 'Gibt es ein Abo?',
    a: `Nein. Du startest mit ${MARKETING.freeImages} Bildern gratis und kaufst danach nur bei Bedarf ein Paket mit ${MARKETING.packImages} Bildern für ${MARKETING.packPrice}.`,
  },
];

interface LandingProps {
  onAuthenticated: (user: AuthUser) => void;
}

/** Startseite für abgemeldete Besucher: Versprechen, Live-Demo, Ablauf, Preis und das Anmeldeformular. */
export function Landing({ onAuthenticated }: LandingProps) {
  const [authRequest, setAuthRequest] = useState<{ mode: 'login' | 'register'; nonce: number }>();

  const startFree = () => {
    setAuthRequest({ mode: 'register', nonce: Date.now() });
    const form = document.getElementById('konto');
    form?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    window.setTimeout(() => form?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }), 400);
  };

  return (
    <div className="flex flex-col gap-24 pb-8 sm:gap-32">
      {/* ---------- Kopf: Versprechen, Formular, Demo ---------- */}
      <section className="grid gap-10 pt-2 sm:pt-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-x-16 lg:gap-y-12">
        <div className="lg:col-start-1 lg:row-start-1">
          <h1 className="text-[2.75rem] leading-[0.98] font-extrabold tracking-[-0.035em] [font-stretch:78%] sm:text-[4.5rem]">
            Anprobe ohne Umkleide.
          </h1>
          <p className="mt-5 max-w-[32rem] text-base leading-relaxed text-muted sm:text-lg">
            Lade ein Foto von dir und eins vom Kleidungsstück hoch. Kleiderstudio zeigt dir, wie es an dir aussieht –
            bevor du bestellst.
          </p>
          <TapeMeasure motion="unroll" className="mt-7 max-w-[32rem]" />
          <ul className="mt-7 flex flex-col gap-2 text-[15px] sm:flex-row sm:flex-wrap sm:gap-x-6">
            {[`${MARKETING.freeImages} Bilder gratis`, 'Kein Abo', 'Direkt im Browser'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 text-accent" strokeWidth={2.5} aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={startFree}
            className="mt-8 inline-flex h-14 items-center rounded-full bg-fg px-8 font-display text-lg font-bold tracking-tight text-white shadow-[0_12px_28px_-12px_rgb(23_32_54/0.7)] transition-[transform,background-color] duration-200 ease-out-soft hover:-translate-y-0.5 hover:bg-accent active:translate-y-0 active:scale-[0.98] lg:hidden"
          >
            Kostenlos starten
          </button>
        </div>

        <div id="konto" className="scroll-mt-20 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <AuthView variant="embedded" onAuthenticated={onAuthenticated} request={authRequest} />
        </div>

        <DemoCard />
      </section>

      {/* ---------- Ablauf ---------- */}
      <section aria-labelledby="ablauf">
        <h2 id="ablauf" className="text-3xl font-extrabold tracking-tight [font-stretch:80%] sm:text-4xl">
          In drei Schritten zum Look
        </h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative flex flex-col gap-2 border-t-2 border-fg pt-5">
              <span
                className="absolute -top-[13px] left-0 flex h-6 min-w-6 items-center justify-center rounded-[4px] border border-tape-edge bg-tape px-1.5 text-xs font-bold tabular-nums"
                aria-hidden
              >
                {index + 1}
              </span>
              <h3 className="font-display text-xl font-bold tracking-tight">{step.title}</h3>
              <p className="text-[15px] leading-relaxed text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Preis ---------- */}
      <section aria-labelledby="preis" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <h2 id="preis" className="text-3xl font-extrabold tracking-tight [font-stretch:80%] sm:text-4xl">
            Zahl nur, was du anprobierst
          </h2>
          <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-muted">
            Kein Abo, keine Laufzeit. Ein Bild ist eine Anprobe; fehlgeschlagene Anfragen werden nicht berechnet.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card flex flex-col gap-1 p-6">
            <p className="text-sm text-muted">Zum Start</p>
            <p className="font-display text-4xl font-extrabold tracking-tight">Gratis</p>
            <p className="text-sm">{MARKETING.freeImages} Bilder nach der Registrierung</p>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-fg p-6 text-white">
            <p className="text-sm text-white/70">{MARKETING.packImages} Bilder</p>
            <p className="font-display text-4xl font-extrabold tracking-tight">{MARKETING.packPrice}</p>
            <p className="text-sm text-white/80">rund 40 Cent pro Anprobe</p>
          </div>
        </div>
      </section>

      {/* ---------- Fragen ---------- */}
      <section aria-labelledby="fragen" className="max-w-[46rem]">
        <h2 id="fragen" className="text-3xl font-extrabold tracking-tight [font-stretch:80%] sm:text-4xl">
          Gut zu wissen
        </h2>
        <div className="mt-8 flex flex-col">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-b border-line py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold tracking-tight [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-lg leading-none transition-transform duration-300 ease-out-soft group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="mt-2 max-w-[38rem] animate-slide-down text-[15px] leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <button
          type="button"
          onClick={startFree}
          className="mt-10 inline-flex h-12 items-center rounded-full bg-fg px-7 font-display text-base font-bold text-white transition-[transform,background-color] duration-200 ease-out-soft hover:-translate-y-0.5 hover:bg-accent active:scale-[0.98]"
        >
          Kostenlos starten
        </button>
      </section>
    </div>
  );
}

/** Vorher/Nachher-Karte: Vorhang öffnet sich, danach pendelt der Regler einmal zur Erklärung. */
function DemoCard() {
  const [curtain, setCurtain] = useState(true);
  const curtainDelay: CSSProperties = { animationDelay: '700ms' };

  return (
    <figure className="card mx-auto w-full max-w-[460px] overflow-hidden lg:col-start-1 lg:row-start-2 lg:mx-0">
      <div
        className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden bg-[#a9a6a1]"
        style={{ containerType: 'size' }}
      >
        {curtain && (
          <>
            <span className="curtain curtain-left" style={curtainDelay} aria-hidden />
            <span
              className="curtain curtain-right"
              style={curtainDelay}
              aria-hidden
              onAnimationEnd={() => setCurtain(false)}
            />
          </>
        )}
        <CompareSlider
          beforeUrl={DEMO.person}
          afterUrl={DEMO.result}
          width={DEMO.width}
          height={DEMO.height}
          beforeLabel="Person"
          intro
        />
      </div>
      <figcaption className="flex items-center gap-3 px-4 py-3">
        {[
          { src: DEMO.person, label: 'Person' },
          { src: DEMO.garment, label: 'Kleidungsstück' },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-2">
            <img src={item.src} alt="" className="size-11 rounded-lg border border-line object-cover" />
            <span className="text-xs text-muted">{item.label}</span>
          </span>
        ))}
        <span className="ml-auto max-w-[11rem] text-right text-xs text-subtle">
          Illustration – zieh den Regler zum Vergleichen
        </span>
      </figcaption>
    </figure>
  );
}
