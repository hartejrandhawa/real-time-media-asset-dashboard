import { useEffect, useState } from "react";

// Returns `value` once it has stopped changing for `delay` ms, so typing in
// a filter box fires one request instead of one per keystroke.
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
