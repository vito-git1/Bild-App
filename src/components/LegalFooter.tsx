const LINKS = [
  { href: '/impressum', label: 'Impressum' },
  { href: '/agb', label: 'AGB' },
  { href: '/widerruf', label: 'Widerruf' },
  { href: '/datenschutz', label: 'Datenschutz' },
];

/** Pflicht-Links zu den Rechtstexten, auf jeder Ansicht sichtbar. */
export function LegalFooter() {
  return (
    <footer className="border-t border-line">
      <nav
        aria-label="Rechtliches"
        className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-5 text-xs text-muted sm:px-6"
      >
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className="hover:text-fg hover:underline">
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
