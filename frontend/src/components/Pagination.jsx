import { formatNumber } from "../lib/format";

// 1 … 4 5 6 … 134
function pageList(page, totalPages) {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  });
  return out;
}

export default function Pagination({ page, pageSize, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-range">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </span>
      <div className="pagination-pages">
        <button type="button" className="btn btn-quiet" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        {pageList(page, totalPages).map((p) =>
          typeof p === "string" ? (
            <span key={p} className="pagination-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className="page-num"
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              onClick={() => onChange(p)}
            >
              {formatNumber(p)}
            </button>
          )
        )}
        <button
          type="button"
          className="btn btn-quiet"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
