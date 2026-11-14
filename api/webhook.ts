/**
 * Vercel-Funktion für POST /api/webhook. Nutzt dieselbe Express-App wie der lokale Server,
 * damit Webhook-URL und Passwort nur serverseitig (Vercel Environment Variables) bekannt sind.
 */
import { app } from '../server/app.js';

export default app;
