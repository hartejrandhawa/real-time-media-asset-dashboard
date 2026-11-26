import { useEffect, useState } from "react";
import { formatRelative } from "../lib/format";

// Re-renders itself once a second so the "updated" time stays honest
// without re-rendering the whole dashboard.
export default function LiveIndicator({ updatedAt, error }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="live" data-state={error ? "error" : "ok"}>
      <span className="live-dot" aria-hidden="true" />
      <span className="live-text">
        {error ? "Reconnecting" : "Live"}
        {updatedAt && (
          <span className="live-time">
            {" "}
            updated {Date.now() - updatedAt < 5000 ? "just now" : formatRelative(updatedAt)}
          </span>
        )}
      </span>
    </span>
  );
}
