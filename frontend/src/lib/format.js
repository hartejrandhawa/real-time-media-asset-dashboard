const numberFmt = new Intl.NumberFormat();
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });

export const formatNumber = (n) => numberFmt.format(n ?? 0);

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export const formatDateTime = (d) => dateTimeFmt.format(new Date(d));

const STEPS = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.35, "week"],
  [12, "month"],
  [Infinity, "year"],
];

export function formatRelative(d, now = Date.now()) {
  let value = (new Date(d).getTime() - now) / 1000;
  for (const [size, unit] of STEPS) {
    if (Math.abs(value) < size) return relFmt.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}

// Best guess at our asset type from the browser-reported MIME type.
export function guessAssetType(file) {
  const t = file?.type ?? "";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("image/")) return "image";
  return "document";
}
