const PATHS = {
  video: "M3 5.5A1.5 1.5 0 0 1 4.5 4h8A1.5 1.5 0 0 1 14 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 14.5zM14 8.5l3.2-2a.5.5 0 0 1 .8.4v6.2a.5.5 0 0 1-.8.4l-3.2-2",
  audio: "M3 8v4M6.5 5v10M10 3v14M13.5 6v8M17 8.5v3",
  image: "M3.5 4h13a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5zM3 13l4-4 4 4 2-2 4 4M13 7.5h.01",
  document: "M5 2.5h6.5L15.5 6.5V17a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5zM11 2.5V7h4.5M7 10.5h6M7 13.5h6",
};

export default function TypeIcon({ type, size = 18, title }) {
  return (
    <svg
      className={`type-icon type-${type}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[type] ?? PATHS.document} />
    </svg>
  );
}
