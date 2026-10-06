// Central runtime constants for RallyHub. Keep names explicit; avoid magic numbers.

export const FEED_PAGE_SIZE = 20;
export const BEST_SHOTS_LIMIT = 20;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_UPLOAD_PIXELS = 25 * 1000 * 1000; // 25 megapixels

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const CLIENT_TARGET_LONG_EDGE = 1600;
export const CLIENT_THUMB_LONG_EDGE = 480;
export const CLIENT_ENCODED_QUALITY = 0.78;

export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const RALLY_LOCATIONS = [
  "Harju",
  "Ruuhimäki",
  "Päijälä",
  "Västilä",
  "Leustu",
  "Ouninpohja",
  "Vekkula",
  "Laukaa",
  "Service Park",
  "Other",
] as const;

export const RALLY_DAYS = ["friday", "saturday", "sunday"] as const;
export type RallyDay = (typeof RALLY_DAYS)[number];

export const BROWSER_ID_COOKIE = "rh_bid";
export const BUCKET_ORIGINAL = "photos-original";
export const BUCKET_THUMB = "photos-thumb";

// Auto-hide photo after this many unresolved reports.
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

// Rate limit (per uploader browser_id).
export const UPLOAD_MIN_INTERVAL_MS = 12_000;