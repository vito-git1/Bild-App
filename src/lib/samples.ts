import type { ImageAsset, SlotKey } from '../types';
import { createImageAsset } from './image';

const SAMPLES: Record<SlotKey, { path: string; name: string }> = {
  image1: { path: '/samples/person.svg', name: 'beispiel-person.png' },
  image2: { path: '/samples/garment.svg', name: 'beispiel-kleidungsstueck.png' },
};

/** Lädt ein lokales Studio-Testbild und rastert es zu einer echten PNG-Datei. */
async function loadSample(slot: SlotKey): Promise<ImageAsset> {
  const sample = SAMPLES[slot];
  const response = await fetch(sample.path);
  if (!response.ok) throw new Error(`Beispielbild ${sample.path} nicht gefunden.`);
  const svg = await response.blob();

  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 768;
    canvas.height = image.naturalHeight || 1024;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas wird von diesem Browser nicht unterstützt.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Beispielbild konnte nicht erzeugt werden.'))),
        'image/png',
      ),
    );
    return createImageAsset(png, sample.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadSamples(): Promise<Record<SlotKey, ImageAsset>> {
  const [image1, image2] = await Promise.all([loadSample('image1'), loadSample('image2')]);
  return { image1, image2 };
}
