import { STATUSES } from "../lib/constants";

// Five bars in the status colours: the same palette as the pipeline strip.
export default function BrandMark({ size = 22 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {STATUSES.map((s, i) => (
        <rect key={s} x={i * 4} y={i % 2 ? 3 : 0} width="3" height={i % 2 ? 17 : 20} rx="1" fill={`var(--s-${s})`} />
      ))}
    </svg>
  );
}
