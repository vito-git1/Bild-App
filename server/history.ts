/**
 * Cloud-Verlauf in Supabase (Tabelle und privater Bucket „generations“).
 * Zugriff nur serverseitig mit dem Secret Key; der Browser spricht nie direkt mit Supabase.
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ResultSource } from './imageResponse.js';
import { extensionForMime } from './mime.js';
import { readImageSize } from './imageSize.js';

const TABLE = 'generations';
const BUCKET = 'generations';
const LIST_LIMIT = 100;

export const HISTORY_IMAGE_KINDS = ['image1', 'image2', 'output'] as const;
export type HistoryImageKind = (typeof HISTORY_IMAGE_KINDS)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HistoryImageInput {
  buffer: Buffer;
  mime: string;
  name: string;
}

/** Metadaten eines Bildes, wie sie in der jsonb-Spalte stehen. */
interface StoredImageRow {
  path: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
}

interface GenerationRow {
  id: string;
  created_at: string;
  duration_ms: number;
  source: ResultSource;
  image1: StoredImageRow;
  image2: StoredImageRow;
  output: StoredImageRow;
}

/** Antwortformat von GET /api/history – muss zu HistoryEntry in src/types.ts passen. */
export interface HistoryEntryDto {
  id: string;
  createdAt: number;
  durationMs: number;
  source: ResultSource;
  image1: HistoryImageDto;
  image2: HistoryImageDto;
  output: HistoryImageDto;
}

interface HistoryImageDto {
  url: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
}

let client: SupabaseClient | null = null;

/** Liest die Zugangsdaten erst zur Laufzeit, weil .env in app.ts nach den Imports geladen wird. */
export function credentials(): { url: string; key: string } {
  return {
    url: process.env.SUPABASE_URL?.trim() ?? '',
    key: process.env.SUPABASE_SECRET_KEY?.trim() ?? '',
  };
}

export function historyEnabled(): boolean {
  const { url, key } = credentials();
  return Boolean(url && key);
}

/** Gemeinsamer Service-Client (Secret Key, umgeht RLS) – nur serverseitig, nie für Nutzer-Logins verwenden. */
export function getClient(): SupabaseClient {
  if (!historyEnabled()) throw new Error('Supabase ist nicht konfiguriert (SUPABASE_URL / SUPABASE_SECRET_KEY).');
  const { url, key } = credentials();
  client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

export function isHistoryId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isHistoryImageKind(value: string): value is HistoryImageKind {
  return (HISTORY_IMAGE_KINDS as readonly string[]).includes(value);
}

/** Speichert Eingaben und Ergebnis einer erfolgreichen Generierung. Gibt die neue ID zurück. */
export async function saveGeneration(userId: string, input: {
  image1: HistoryImageInput;
  image2: HistoryImageInput;
  output: HistoryImageInput;
  durationMs: number;
  source: ResultSource;
}): Promise<string> {
  const supabase = getClient();
  const id = randomUUID();
  const rows = {} as Record<HistoryImageKind, StoredImageRow>;

  await Promise.all(
    HISTORY_IMAGE_KINDS.map(async (kind) => {
      const image = input[kind];
      const path = `${folderOf(userId, id)}/${kind}.${extensionForMime(image.mime)}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, image.buffer, { contentType: image.mime, upsert: false });
      if (error) throw new Error(`Upload von ${kind} fehlgeschlagen: ${error.message}`);
      rows[kind] = {
        path,
        name: image.name.slice(0, 200),
        type: image.mime,
        size: image.buffer.length,
        ...readImageSize(image.buffer, image.mime),
      };
    }),
  ).catch(async (error: unknown) => {
    await removeFolder(userId, id);
    throw error;
  });

  const { error } = await supabase.from(TABLE).insert({
    id,
    user_id: userId,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    source: input.source,
    ...rows,
  });
  if (error) {
    await removeFolder(userId, id);
    throw new Error(`Verlaufseintrag konnte nicht gespeichert werden: ${error.message}`);
  }
  return id;
}

export async function listGenerations(userId: string): Promise<HistoryEntryDto[]> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select('id, created_at, duration_ms, source, image1, image2, output')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw new Error(`Verlauf konnte nicht geladen werden: ${error.message}`);
  return (data as GenerationRow[]).map(toDto);
}

export async function getGenerationImage(
  userId: string,
  id: string,
  kind: HistoryImageKind,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const supabase = getClient();
  const { data: row, error } = await supabase
    .from(TABLE)
    .select(kind)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Verlaufseintrag konnte nicht gelesen werden: ${error.message}`);
  const image = (row as Record<HistoryImageKind, StoredImageRow> | null)?.[kind];
  if (!image) return null;

  const { data: file, error: downloadError } = await supabase.storage.from(BUCKET).download(image.path);
  if (downloadError || !file) return null;
  return { buffer: Buffer.from(await file.arrayBuffer()), mime: image.type };
}

export async function deleteGeneration(userId: string, id: string): Promise<boolean> {
  const { data, error } = await getClient()
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw new Error(`Verlaufseintrag konnte nicht gelöscht werden: ${error.message}`);
  if (!data?.length) return false;
  await removeFolder(userId, id);
  return true;
}

/** Bilder liegen pro Nutzer: <userId>/<id>/<kind>.<ext> */
function folderOf(userId: string, id: string): string {
  return `${userId}/${id}`;
}

async function removeFolder(userId: string, id: string): Promise<void> {
  const paths = HISTORY_IMAGE_KINDS.flatMap((kind) =>
    ['jpg', 'png', 'webp', 'gif', 'avif'].map((extension) => `${folderOf(userId, id)}/${kind}.${extension}`),
  );
  const { error } = await getClient().storage.from(BUCKET).remove(paths);
  if (error) console.warn(`[kleiderstudio] Bilder von ${id} konnten nicht gelöscht werden:`, error.message);
}

function toDto(row: GenerationRow): HistoryEntryDto {
  const image = (kind: HistoryImageKind): HistoryImageDto => {
    const { path: _path, ...meta } = row[kind];
    return { ...meta, url: `/api/history/${row.id}/${kind}` };
  };
  return {
    id: row.id,
    createdAt: Date.parse(row.created_at),
    durationMs: row.duration_ms,
    source: row.source,
    image1: image('image1'),
    image2: image('image2'),
    output: image('output'),
  };
}
