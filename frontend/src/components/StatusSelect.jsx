import { STATUSES, STATUS_LABELS } from "../lib/constants";

export default function StatusSelect({ value, onChange, disabled, label = "Status", className = "" }) {
  return (
    <span className={`status-select s-${value} ${className}`}>
      <span className="status-swatch" aria-hidden="true" />
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </span>
  );
}
