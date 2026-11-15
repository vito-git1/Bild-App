import { HISTORY_ENDPOINT } from '../config';
import type { HistoryEntry, HistoryImage, ImageAsset } from '../types';
import { request, toApiError } from './apiClient';
import { createImageAsset } from './image';

export async function listHistoryEntries(): Promise<HistoryEntry[]> {
  const response = await request(HISTORY_ENDPOINT, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw await toApiError(response, 'Der Verlauf konnte nicht geladen werden.');
  const body = (await response.json()) as { entries: HistoryEntry[] };
  return body.entries;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const response = await request(`${HISTORY_ENDPOINT}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw await toApiError(response, 'Eintrag konnte nicht gelöscht werden.');
}

export async function fetchHistoryBlob(image: HistoryImage): Promise<Blob> {
  const response = await request(image.url);
  if (!response.ok) throw await toApiError(response, 'Das Bild konnte nicht geladen werden.');
  const blob = await response.blob();
  return blob.type === image.type ? blob : new Blob([blob], { type: image.type });
}

/** Lädt ein Verlaufsbild und misst es wie einen normalen Upload aus. */
export async function assetFromHistory(image: HistoryImage): Promise<ImageAsset> {
  return createImageAsset(await fetchHistoryBlob(image), image.name);
}
