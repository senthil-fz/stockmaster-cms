import { useEffect, useMemo, useRef } from 'react';

export type Debounced<A extends unknown[]> = ((...args: A) => void) & {
  /** Immediately run the pending call (if any) with its latest args, then clear the timer. */
  flush: () => void;
  /** Drop the pending call without running it. */
  cancel: () => void;
};

/**
 * Returns a stable debounced version of `fn`, plus `.flush()` and `.cancel()`.
 * On unmount the pending call is CANCELLED (not run) — callers that must not lose a
 * pending call are responsible for flushing or persisting it before/at teardown.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): Debounced<A> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastArgs = useRef<A | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useMemo(() => {
    const debounced = ((...args: A) => {
      lastArgs.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        fnRef.current(...args);
      }, delay);
    }) as Debounced<A>;

    debounced.flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        if (lastArgs.current) fnRef.current(...lastArgs.current);
      }
    };
    debounced.cancel = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    return debounced;
  }, [delay]);
}
