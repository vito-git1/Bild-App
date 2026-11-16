import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { app, IS_PROD } from './server/app.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
/** Standardmäßig nur auf diesem Rechner erreichbar. HOST=0.0.0.0 öffnet den Server fürs Netzwerk. */
const HOST = process.env.HOST?.trim() || '127.0.0.1';

// Rechtstexte unter kurzen Adressen (/agb statt /agb.html) – auf Vercel erledigt das "cleanUrls".
const LEGAL_PAGES = ['impressum', 'agb', 'widerruf', 'datenschutz'];
app.get(LEGAL_PAGES.map((page) => `/${page}`), (req, res) => {
  res.sendFile(path.join(ROOT, IS_PROD ? 'dist' : 'public', `${req.path.slice(1)}.html`));
});

if (IS_PROD) {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(PORT, HOST, () => {
  const shown = HOST === '127.0.0.1' ? 'localhost' : HOST;
  console.log(`Kleiderstudio läuft auf http://${shown}:${PORT} (${IS_PROD ? 'Produktion' : 'Entwicklung'})`);
});
