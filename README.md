# Kleiderstudio

Virtuelle Anprobe im Browser: Du lädst ein **Foto einer Person** und ein **Foto eines Kleidungsstücks** hoch – die App erzeugt daraus ein Bild, auf dem die Person das Kleidungsstück trägt.

- Anmeldung mit E-Mail-Bestätigung
- Vorher/Nachher-Vergleich per Schieberegler
- Verlauf aller eigenen Bilder in der Cloud
- Guthaben-System: neue Nutzer erhalten 3 Gratis-Bilder, weitere Pakete per Stripe

## So funktioniert es

```
Browser  →  eigener Server (Express)  →  n8n-Workflow (Bild-KI)
                    │
                    ├─ Supabase (Login, Verlauf, Guthaben)
                    └─ Stripe (Bezahlung)
```

Der Browser spricht nur mit dem eigenen Server. Alle Zugangsdaten (n8n, Supabase, Stripe) bleiben auf dem Server.

## Voraussetzungen

- [Node.js](https://nodejs.org) ab Version 20.11
- Ein n8n-Workflow mit Webhook, der zwei Bilder (`image1`, `image2`) annimmt und ein Bild zurückgibt
- Ein [Supabase](https://supabase.com)-Projekt (für Login und Verlauf)
- Optional: ein [Stripe](https://stripe.com)-Konto (für den Kauf von Guthaben)

## Installation

**1. Projekt herunterladen und Pakete installieren**

```bash
git clone https://github.com/vito-git1/Bild-App.git
cd Bild-App
npm install
```

**2. Konfiguration anlegen**

Kopiere die Vorlage `.env.example` nach `.env`:

```bash
cp .env.example .env
```

Trage danach in `.env` mindestens diese Werte ein:

| Variable | Woher? |
|---|---|
| `WEBHOOK_URL` | URL des Webhook-Nodes in n8n |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → „Secret keys“ |

Optional:

| Variable | Zweck |
|---|---|
| `WEBHOOK_SECRET` | Zusätzlicher Schutz des n8n-Webhooks (Header Auth) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Aktiviert den Kauf-Button |
| `CREDIT_PACK_SIZE`, `CREDIT_PACK_PRICE_CENTS` | Paketgröße und Preis (Standard: 25 Bilder für 9,99 €) |
| `PORT`, `HOST` | Port und Adresse des Servers (Standard: `3000`, `127.0.0.1`) |

> ⚠️ Die Datei `.env` enthält geheime Schlüssel und darf **niemals** ins Git-Repository. Sie ist bereits in `.gitignore` eingetragen.

**3. App starten**

```bash
npm run dev
```

Öffne danach [http://localhost:3000](http://localhost:3000) im Browser.

## Befehle

| Befehl | Was passiert |
|---|---|
| `npm run dev` | Startet die App zum Entwickeln (mit automatischem Neuladen) |
| `npm run build` | Prüft die Typen und baut die App für den Live-Betrieb nach `dist/` |
| `npm start` | Startet die gebaute App aus `dist/` |
| `npm run typecheck` | Prüft nur die TypeScript-Typen |

## Veröffentlichen auf Vercel

1. Repository in [Vercel](https://vercel.com) importieren – die Einstellungen kommen aus `vercel.json`.
2. Unter **Settings → Environment Variables** dieselben Werte wie in `.env` eintragen.
3. In Supabase unter **Authentication → URL Configuration** die eigene Domain als *Site URL* und als *Redirect URL* (mit `/**`) eintragen.
4. Für Stripe einen Webhook auf `https://<deine-domain>/api/billing/webhook` mit dem Ereignis `checkout.session.completed` anlegen.

Jeder Push auf `main` wird danach automatisch veröffentlicht.

## Projektaufbau

```
server.ts        Startet den Server lokal
server/          Server-Logik (Proxy zu n8n, Login, Verlauf, Guthaben, Sicherheit)
api/webhook.ts   Einstiegspunkt für Vercel
src/             Oberfläche (React + Tailwind CSS)
public/          Statische Dateien, Rechtstexte (Impressum, AGB, Datenschutz, Widerruf)
```

## Vor dem Livegang

In den Rechtstexten unter `public/` stehen noch Platzhalter für die Betreiberdaten. Suche nach `platzhalter` und ersetze sie. Die Texte sind eine Vorlage und keine Rechtsberatung.
