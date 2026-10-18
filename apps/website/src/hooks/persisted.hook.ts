import { useState, useCallback } from "react";

/**
 * Like useState but persists to localStorage.
 * Key is prefixed with "rheoson-" automatically.
 */
export function usePersisted<T>(
   key: string,
   defaultValue: T
): [T, (v: T) => void] {
   const [value, setValue] = useState<T>(() => {
      try {
         const raw = localStorage.getItem(`rheoson-${key}`);
         return raw !== null ? JSON.parse(raw) : defaultValue;
      } catch {
         return defaultValue;
      }
   });

   const set = useCallback(
      (v: T) => {
         setValue(v);
         try {
            localStorage.setItem(`rheoson-${key}`, JSON.stringify(v));
         } catch {
            //ignore expected error
         }
      },
      [key]
   );

   return [value, set];
}
