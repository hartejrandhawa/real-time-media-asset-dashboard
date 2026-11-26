// Order matters: it's the left-to-right order of the pipeline strip.
export const STATUSES = ["ready", "processing", "pending", "failed", "archived"];

export const STATUS_LABELS = {
  ready: "Ready",
  processing: "Processing",
  pending: "Pending",
  failed: "Failed",
  archived: "Archived",
};

export const ASSET_TYPES = ["video", "audio", "image", "document"];

export const TYPE_LABELS = {
  video: "Video",
  audio: "Audio",
  image: "Image",
  document: "Document",
};

export const EVENT_LABELS = {
  created: "Created",
  upload_confirmed: "Upload confirmed",
  upload_failed: "Upload failed",
  status_change: "Status changed",
};

export const PAGE_SIZE = 15;
export const POLL_MS = 10_000;
