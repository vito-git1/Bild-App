# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Kleiderstudio** — a virtual try-on web app: the user uploads two images (`image1` = person, `image2` = garment), they are sent (via the server) to an n8n webhook workflow whose URL is configured server-side only, and the composited result image is shown, compared and stored in a local history. All UI text, error messages and code comments are in **German**; keep it that way.

## Commands

- `npm run dev` — starts the Express server (`server.ts`) via `tsx watch`, with Vite mounted as middleware (single port, default 3000). Changes under `src/` are handled by Vite HMR; the server only restarts for server-side changes.
- `npm run build` — `tsc --noEmit` then `vite build` into `dist/`.
- `npm start` — runs `server.ts --prod`, serving `dist/` statically with SPA fallback.
- `npm run typecheck` — type check only (covers `src`, `server`, `server.ts`, `vite.config.ts`).

There is no test runner or linter configured. Requires Node >= 20.11.

Env vars (see `.env.example`): `PORT`, `ALLOW_PRIVATE_WEBHOOKS` (default `false`; set `true` to allow n8n in a LAN/localhost), `WEBHOOK_URL` (the n8n webhook; **required**, lives only in the git-ignored `.env` — never commit it, the repo is public, and never ship it to the browser). `server.ts` loads `.env` via `process.loadEnvFile` if present. Also: `HOST` (default `127.0.0.1`, i.e. not reachable from the LAN), `WEBHOOK_SECRET` (optional, sent to n8n as header `X-Kleiderstudio-Secret` for Header Auth), `RATE_LIMIT_PER_MINUTE` (default 10 per IP) and `MAX_CONCURRENT` (default 3) to limit paid generations. In production a strict CSP is set; result images are only passed through when recognized by magic bytes (no SVG).

## Architecture

**Request flow:** Browser → `POST /api/webhook` (multipart: `image1`, `image2`) on the Express proxy → forwards the two images as multipart to `WEBHOOK_URL` → normalizes the response into raw image bytes → returns them with headers `X-Processing-Time-Ms` and `X-Result-Source` (`binary` | `base64` | `url`).

The browser never calls n8n directly; the proxy exists to avoid CORS and to normalize the many shapes an n8n "Respond to Webhook" node can return.

### Server (`server.ts`, `server/`)
- `server.ts` — Express 5 app, multer in-memory upload (25 MB/file, only fields `image1`/`image2`), 120 s upstream timeout, client-abort propagation via `AbortSignal.any`. Errors are thrown as `ProxyError` and serialized by the final error handler into `ProxyErrorBody` (`error`, `upstreamStatus`, `upstreamContentType`, `upstreamBody`, `hint`). `hintForStatus` and the JSON-without-image branch produce German troubleshooting hints for common n8n misconfigurations (inactive workflow, wrong path, webhook responding immediately).
- `server/imageResponse.ts` — magic-byte sniffing (`sniffImageMime`) and `findImageInJson`, which walks JSON responses looking for inline data-URI/base64 images first, then image URLs (scored by file extension and key name).
- `server/ssrf.ts` — SSRF protection. `parseWebhookUrl` rejects non-http(s), credentials, and obviously local hosts/IPs; `guardedAgent` (undici `Agent` with a custom DNS `lookup`) re-checks every resolved address at connect time, and its custom connector also rejects private IP *literals* (which skip DNS lookup), so redirects and DNS rebinding are covered. **All outbound fetches (webhook and result-image URLs) must use `dispatcher: guardedAgent`.**
- `ProxyErrorBody` is duplicated in `server.ts` and `src/types.ts` — keep them in sync.

### Client (`src/`)
- React 19 + Tailwind CSS v4 (via `@tailwindcss/vite`), `lucide-react` icons. Fonts loaded from Google Fonts in `index.html`.
- `config.ts` — proxy endpoint, upload limit, localStorage keys. The webhook URL must never be put into client code or UI (product decision: it should not be visible on the page).
- `lib/api.ts` — `sendToWebhook` calls the proxy and turns failures into `WebhookError` carrying a `RequestFailure`.
- `lib/image.ts` — creates `ImageAsset`s (type/size validation, dimension measurement) and `prepareUpload`, which converts client-side to WebP/JPEG/original via canvas (falls back to JPEG when the browser can't encode WebP).
- `lib/historyDb.ts` — IndexedDB store (`kleiderstudio` / `generations`) holding `HistoryEntry` records with the input and output image blobs.
- `lib/samples.ts` — rasterizes `public/samples/*.svg` into PNG sample inputs.
- `types.ts` — shared domain types (`RequestState` discriminated union, `View` = `studio` | `history`, `ResultMode`, etc.).

- `App.tsx` — root component: holds all state (view, slot assets/errors, `RequestState`; upload format is fixed to WebP), sends via `prepareUpload` + `sendToWebhook` (aborting/ignoring stale requests), writes successful results to `historyDb`, and wires global shortcuts (Strg+Enter = senden, Strg+V = Bild in aktiven Slot einfügen).
- `components/` — `TopNav`, `UploadSlot`, `ActionBar`, `ResultPanel` (+ `CompareSlider`, `Lightbox`), `HistoryView`, small shared pieces. Styling tokens and `.card`/`.btn-*` classes live in `src/index.css`.
