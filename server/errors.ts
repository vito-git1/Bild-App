/** Fehlerformat der API. Muss zu ProxyErrorBody in src/types.ts passen. */
export interface ProxyErrorBody {
  error: string;
  upstreamStatus?: number;
  upstreamContentType?: string;
  upstreamBody?: string;
  hint?: string;
}

/** Wird vom letzten Error-Handler in server/app.ts als ProxyErrorBody serialisiert. */
export class ProxyError extends Error {
  readonly statusCode: number;
  readonly details: Omit<ProxyErrorBody, 'error'>;

  constructor(statusCode: number, message: string, details: Omit<ProxyErrorBody, 'error'> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}
