import { STATUS_LABELS } from "../lib/constants";

export default function StatusMark({ status }) {
  return (
    <span className={`status-mark s-${status}`}>
      <span className="status-swatch" aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
