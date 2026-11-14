import { useEffect, useState } from 'react';

/** Laufzeit in Millisekunden seit startedAt, aktualisiert alle 100 ms. */
export function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}
