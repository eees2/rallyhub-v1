// Server functions covering the entire visitor-facing write surface:
// upload signing/finalisation, likes, reports, and public listing.
// Every mutation is server-authoritative; visitors have no direct DB access.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  ALLOWED_MIME_TYPES,
  AUTO_HIDE_REPORT_THRESHOLD,
  BEST_SHOTS_LIMIT,
  FEED_PAGE_SIZE,
  MAX_UPLOAD_BYTES,
  RALLY_DAYS,
  UPLOAD_MIN_INTERVAL_MS,
} from "./constants";

// ---------- Shared types (client-safe) ------------------------------------

export interface FeedPhoto {
  id: string;
  thumbUrl: string;
  likeCount: number;
  hasLiked: boolean;
  createdAt: string;
  day: string | null;
  location: string | null;
  width: number | null;
  height: number | null;
}

export interface FeedPage {
  photos: FeedPhoto[];
  nextCursor: string | null;
}

export interface PhotoDetails extends FeedPhoto {
  originalUrl: string;
  hasReported: boolean;
}

// ---------- Public feed ---------------------------------------------------

export const listFeed = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ cursor: z.string().datetime().nullable().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<FeedPage> => {
    const { getServiceClient, signThumbUrls } = await import("./photos.server");
    const { getBrowserIdIfPresent } = await import("./browser-id.server");
    const supabase = getServiceClient();

    let q = supabase
      .from("photos")
      .select("id, storage_path_thumb, like_count, created_at, day, location, width, height")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(FEED_PAGE_SIZE);

    if (data.cursor) q = q.lt("created_at", data.cursor);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return buildFeedPage(rows ?? [], await getBrowserIdIfPresent(), signThumbUrls);
  });

export const listBestShots = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeedPage> => {
    const { getServiceClient, signThumbUrls } = await import("./photos.server");
    const { getBrowserIdIfPresent } = await import("./browser-id.server");
    const supabase = getServiceClient();

    const { data: rows, error } = await supabase
      .from("photos")
      .select("id, storage_path_thumb, like_count, created_at, day, location, width, height")
      .eq("status", "approved")
      .order("like_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(BEST_SHOTS_LIMIT);
    if (error) throw new Error(error.message);

    return buildFeedPage(rows ?? [], await getBrowserIdIfPresent(), signThumbUrls);
  },
);

// Shared: enrich raw rows with signed URLs and liked-state for this browser.
async function buildFeedPage(
  rows: Array<{
    id: string;
    storage_path_thumb: string;
    like_count: number;
    created_at: string;
    day: string | null;
    location: string | null;
    width: number | null;
    height: number | null;
  }>,
  browserId: string | null,
  signThumbUrls: (paths: string[]) => Promise<Map<string, string>>,
): Promise<FeedPage> {
  const thumbUrls = await signThumbUrls(rows.map((r) => r.storage_path_thumb));

  let likedSet = new Set<string>();
  if (browserId && rows.length > 0) {
    const { getServiceClient } = await import("./photos.server");
    const supabase = getServiceClient();
    const { data: likes } = await supabase
      .from("likes")
      .select("photo_id")
      .eq("browser_id", browserId)
      .in(
        "photo_id",
        rows.map((r) => r.id),
      );
    likedSet = new Set((likes ?? []).map((l) => l.photo_id));
  }

  const photos: FeedPhoto[] = rows.map((r) => ({
    id: r.id,
    thumbUrl: thumbUrls.get(r.storage_path_thumb) ?? "",
    likeCount: r.like_count,
    hasLiked: likedSet.has(r.id),
    createdAt: r.created_at,
    day: r.day,
    location: r.location,
    width: r.width,
    height: r.height,
  }));

  const nextCursor = rows.length === FEED_PAGE_SIZE ? rows[rows.length - 1].created_at : null;
  return { photos, nextCursor };
}

// ---------- Photo details (viewer) ---------------------------------------

export const getPhotoDetails = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<PhotoDetails> => {
    const { getServiceClient, signThumbUrls, signOriginalUrl } = await import(
      "./photos.server"
    );
    const { getBrowserIdIfPresent } = await import("./browser-id.server");
    const supabase = getServiceClient();

    const { data: row, error } = await supabase
      .from("photos")
      .select(
        "id, storage_path_thumb, storage_path_original, like_count, created_at, day, location, width, height, status",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row || row.status !== "approved") throw new Error("Photo not found.");

    const [thumbUrls, originalUrl, browserId] = await Promise.all([
      signThumbUrls([row.storage_path_thumb]),
      signOriginalUrl(row.storage_path_original),
      getBrowserIdIfPresent(),
    ]);

    let hasLiked = false;
    let hasReported = false;
    if (browserId) {
      const [{ data: like }, { data: report }] = await Promise.all([
        supabase
          .from("likes")
          .select("photo_id")
          .eq("photo_id", row.id)
          .eq("browser_id", browserId)
          .maybeSingle(),
        supabase
          .from("reports")
          .select("id")
          .eq("photo_id", row.id)
          .eq("reporter_browser_id", browserId)
          .maybeSingle(),
      ]);
      hasLiked = !!like;
      hasReported = !!report;
    }

    return {
      id: row.id,
      thumbUrl: thumbUrls.get(row.storage_path_thumb) ?? "",
      originalUrl: originalUrl ?? "",
      likeCount: row.like_count,
      hasLiked,
      hasReported,
      createdAt: row.created_at,
      day: row.day,
      location: row.location,
      width: row.width,
      height: row.height,
    };
  });

// ---------- Upload flow ---------------------------------------------------

export interface UploadTarget {
  photoId: string;
  originalPath: string;
  thumbPath: string;
  originalUploadUrl: string;
  originalUploadToken: string;
  thumbUploadUrl: string;
  thumbUploadToken: string;
}

export const requestUploadTarget = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        contentType: z.enum(ALLOWED_MIME_TYPES),
        byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<UploadTarget> => {
    const { getServiceClient, buildStoragePath, BUCKET_ORIGINAL, BUCKET_THUMB } =
      await import("./photos.server");
    const { ensureBrowserId } = await import("./browser-id.server");
    const supabase = getServiceClient();
    const browserId = await ensureBrowserId();

    // Simple per-browser rate limit: reject if a pending upload was created
    // less than UPLOAD_MIN_INTERVAL_MS ago.
    const cutoff = new Date(Date.now() - UPLOAD_MIN_INTERVAL_MS).toISOString();
    const { count: recentCount } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("uploader_browser_id", browserId)
      .gte("created_at", cutoff);
    if ((recentCount ?? 0) > 0) {
      throw new Error("You're uploading too quickly — try again in a moment.");
    }

    const photoId = crypto.randomUUID();
    const ext = extensionForMime(data.contentType);
    const originalPath = buildStoragePath(photoId, ext);
    const thumbPath = buildStoragePath(photoId, "webp");

    const [original, thumb] = await Promise.all([
      supabase.storage.from(BUCKET_ORIGINAL).createSignedUploadUrl(originalPath),
      supabase.storage.from(BUCKET_THUMB).createSignedUploadUrl(thumbPath),
    ]);
    if (original.error || thumb.error || !original.data || !thumb.data) {
      throw new Error("Could not prepare upload — please try again.");
    }

    const { error: insertError } = await supabase.from("photos").insert({
      id: photoId,
      uploader_browser_id: browserId,
      storage_path_original: originalPath,
      storage_path_thumb: thumbPath,
      bytes: data.byteSize,
      status: "pending",
    });
    if (insertError) throw new Error(insertError.message);

    return {
      photoId,
      originalPath,
      thumbPath,
      originalUploadUrl: original.data.signedUrl,
      originalUploadToken: original.data.token,
      thumbUploadUrl: thumb.data.signedUrl,
      thumbUploadToken: thumb.data.token,
    };
  });

export const finalizeUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        photoId: z.string().uuid(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        day: z.enum(RALLY_DAYS).nullable().optional(),
        location: z.string().max(80).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { getServiceClient, BUCKET_ORIGINAL, BUCKET_THUMB } = await import(
      "./photos.server"
    );
    const { ensureBrowserId } = await import("./browser-id.server");
    const supabase = getServiceClient();
    const browserId = await ensureBrowserId();

    const { data: photo, error } = await supabase
      .from("photos")
      .select("id, uploader_browser_id, status, storage_path_original, storage_path_thumb")
      .eq("id", data.photoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!photo) throw new Error("Upload target not found.");
    if (photo.uploader_browser_id !== browserId) throw new Error("Not your upload.");
    if (photo.status !== "pending") throw new Error("Upload already finalised.");

    // Verify both objects landed in storage before approving.
    const [thumbInfo, originalInfo] = await Promise.all([
      supabase.storage.from(BUCKET_THUMB).createSignedUrl(photo.storage_path_thumb, 60),
      supabase.storage
        .from(BUCKET_ORIGINAL)
        .createSignedUrl(photo.storage_path_original, 60),
    ]);
    if (thumbInfo.error || originalInfo.error) {
      await supabase.from("photos").delete().eq("id", photo.id);
      throw new Error("Upload incomplete — please try again.");
    }

    const { error: updateError } = await supabase
      .from("photos")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        width: data.width,
        height: data.height,
        day: data.day ?? null,
        location: data.location ?? null,
      })
      .eq("id", photo.id);
    if (updateError) throw new Error(updateError.message);

    return { id: photo.id };
  });

// ---------- Likes ---------------------------------------------------------

export const toggleLike = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ photoId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ liked: boolean; likeCount: number }> => {
    const { getServiceClient } = await import("./photos.server");
    const { ensureBrowserId } = await import("./browser-id.server");
    const supabase = getServiceClient();
    const browserId = await ensureBrowserId();

    const { data: existing } = await supabase
      .from("likes")
      .select("photo_id")
      .eq("photo_id", data.photoId)
      .eq("browser_id", browserId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("photo_id", data.photoId)
        .eq("browser_id", browserId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("likes")
        .insert({ photo_id: data.photoId, browser_id: browserId });
      // Ignore duplicate-key races.
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    }

    const { data: photo } = await supabase
      .from("photos")
      .select("like_count")
      .eq("id", data.photoId)
      .maybeSingle();
    return { liked: !existing, likeCount: photo?.like_count ?? 0 };
  });

// ---------- Reports -------------------------------------------------------

export const reportPhoto = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ photoId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getServiceClient } = await import("./photos.server");
    const { ensureBrowserId } = await import("./browser-id.server");
    const supabase = getServiceClient();
    const browserId = await ensureBrowserId();

    // One report per browser per photo; ignore duplicates.
    const { error: insertError } = await supabase
      .from("reports")
      .insert({ photo_id: data.photoId, reporter_browser_id: browserId });
    if (insertError && !insertError.message.includes("duplicate")) {
      throw new Error(insertError.message);
    }

    // Auto-hide if unresolved-report threshold reached.
    const { count } = await supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("photo_id", data.photoId)
      .is("resolved_at", null);
    if ((count ?? 0) >= AUTO_HIDE_REPORT_THRESHOLD) {
      await supabase
        .from("photos")
        .update({ status: "pending" })
        .eq("id", data.photoId)
        .eq("status", "approved");
      await supabase.from("audit_log").insert({
        action: "photo.auto_hide",
        target_type: "photo",
        target_id: data.photoId,
        metadata: { unresolved_reports: count },
      });
    }

    return { ok: true };
  });

// ---------- Helpers -------------------------------------------------------

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
    case "image/heif":
      return "heic";
    default:
      return "bin";
  }
}