// Server-only helpers for photo storage and signed-URL generation.
// This file's name (*.server.ts) blocks it from client bundles.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { BUCKET_ORIGINAL, BUCKET_THUMB, SIGNED_URL_TTL_SECONDS } from "./constants";

let cachedAdmin: SupabaseClient<Database> | null = null;

export function getServiceClient(): SupabaseClient<Database> {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server env.");
  cachedAdmin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

// Batch-generate signed download URLs for thumbnails. Returns a Map
// keyed by storage path.
export async function signThumbUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_THUMB)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return map;
  for (const item of data) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

export async function signOriginalUrl(path: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_ORIGINAL)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

// Build a date-based storage key so we never store thousands of files
// in a single directory. Example: 2026/07/18/<uuid>.<ext>
export function buildStoragePath(photoId: string, ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${yyyy}/${mm}/${dd}/${photoId}.${safeExt}`;
}

export { BUCKET_ORIGINAL, BUCKET_THUMB };