import { useEffect, useState } from 'react';
import { readStorage, writeStorage } from '../lib/storage';

export function usePersistentState<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = readStorage(key);
    return stored !== null && isValid(stored) ? stored : fallback;
  });

  useEffect(() => {
    writeStorage(key, value);
  }, [key, value]);

  return [value, setValue];
}
