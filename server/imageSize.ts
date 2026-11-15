/** Liest die Bildabmessungen aus dem Dateikopf (PNG, JPEG, WebP, GIF). Unbekannt => 0 × 0. */
export function readImageSize(buffer: Buffer, mime: string): { width: number; height: number } {
  try {
    const size = readSize(buffer, mime);
    if (size && size.width > 0 && size.height > 0) return size;
  } catch {
    // Beschädigter Header – Abmessungen bleiben unbekannt.
  }
  return { width: 0, height: 0 };
}

function readSize(buffer: Buffer, mime: string): { width: number; height: number } | null {
  switch (mime) {
    case 'image/png':
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    case 'image/gif':
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    case 'image/webp':
      return readWebpSize(buffer);
    case 'image/jpeg':
      return readJpegSize(buffer);
    default:
      return null;
  }
}

function readWebpSize(buffer: Buffer): { width: number; height: number } | null {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === 'VP8X') {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  return null;
}

function readJpegSize(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}
