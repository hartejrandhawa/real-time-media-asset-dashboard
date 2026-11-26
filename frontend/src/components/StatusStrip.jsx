import { STATUSES, STATUS_LABELS } from "../lib/constants";
import { formatNumber } from "../lib/format";

// The pipeline strip: one proportional bar showing where every asset sits,
// read left to right like a timeline track. Each segment and legend entry
// filters the table to that status; clicking the active one clears it.
export default function StatusStrip({ stats, active, onSelect }) {
  const total = stats?.total ?? 0;

  return (
    <div className="strip" data-loading={!stats || undefined}>
      <div className="strip-bar" role="presentation">
        {total === 0 ? (
          <span className="strip-empty" />
        ) : (
          STATUSES.filter((s) => stats.byStatus[s] > 0).map((s) => (
            <button
              key={s}
              type="button"
              tabIndex={-1}
              className={`strip-seg s-${s}`}
              data-dim={(active && active !== s) || undefined}
              style={{ flexGrow: stats.byStatus[s] }}
              title={`${STATUS_LABELS[s]}: ${formatNumber(stats.byStatus[s])}`}
              onClick={() => onSelect(active === s ? "" : s)}
            />
          ))
        )}
      </div>
      <div className="strip-legend" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`legend-item s-${s}`}
            aria-pressed={active === s}
            onClick={() => onSelect(active === s ? "" : s)}
          >
            <span className="status-swatch" aria-hidden="true" />
            <span className="legend-label">{STATUS_LABELS[s]}</span>
            <span className="legend-count">{stats ? formatNumber(stats.byStatus[s]) : "–"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
