import { useEffect, useRef } from "react";

// Calls `fn` every `ms` while the tab is visible, and once immediately when
// the tab becomes visible again. Polling (rather than WebSockets) because the
// API runs on Lambda + API Gateway HTTP API, which can't hold connections open.
export function usePolling(fn, ms) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let timer;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(() => fnRef.current(), ms);
    };
    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(timer);
      } else {
        fnRef.current();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);
}
