const sizeFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const secondsFormatter = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormatter.format(bytes / 1024)} KB`;
  return `${sizeFormatter.format(bytes / 1024 / 1024)} MB`;
}

export function formatSeconds(ms: number): string {
  return `${secondsFormatter.format(ms / 1000)} s`;
}

export function formatDate(timestamp: number): string {
  return dateFormatter.format(timestamp);
}

export function formatResolution(width: number, height: number): string {
  return `${width} × ${height}`;
}
