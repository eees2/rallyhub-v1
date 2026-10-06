// Admin-only server functions: moderation queue, delete/restore, stats,
// report review. Each verifies the caller has the "admin" role via the
// authenticated Supabase client (RLS + has_role) before touching data.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Supa = SupabaseClient<Database>;

async function assertAdmin(supabase: Supa, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

type PhotoStatus = Database["public"]["Enums"]["photo_status"];

export interface AdminPhoto {
  id: string;
  storagePathThumb: string;
  thumbUrl: string;
  status: string;
  createdAt: string;
  likeCount: number;
  unresolvedReports: number;
}

export const listAdminQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["pending", "approved", "deleted"]).default("pending"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AdminPhoto[]> => {
    await assertAdmin(context.supabase as Supa, context.userId);
    const { getServiceClient, signThumbUrls } = await import("./photos.server");
    const admin = getServiceClient();

    const { data: rows, error } = await admin
      .from("photos")
      .select("id, storage_path_thumb, status, created_at, like_count")
      .eq("status", data.status)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const thumbs = await signThumbUrls((rows ?? []).map((r) => r.storage_path_thumb));

    // Aggregate unresolved reports.
    const ids = (rows ?? []).map((r) => r.id);
    const reportCounts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: reports } = await admin
        .from("reports")
        .select("photo_id")
        .in("photo_id", ids)
        .is("resolved_at", null);
      for (const r of reports ?? []) {
        reportCounts.set(r.photo_id, (reportCounts.get(r.photo_id) ?? 0) + 1);
      }
    }

    return (rows ?? []).map((r) => ({
      id: r.id,
      storagePathThumb: r.storage_path_thumb,
      thumbUrl: thumbs.get(r.storage_path_thumb) ?? "",
      status: r.status,
      createdAt: r.created_at,
      likeCount: r.like_count,
      unresolvedReports: reportCounts.get(r.id) ?? 0,
    }));
  });

export const adminSetPhotoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        photoId: z.string().uuid(),
        status: z.enum(["approved", "pending", "deleted"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase as Supa, context.userId);
    const { getServiceClient } = await import("./photos.server");
    const admin = getServiceClient();

    const nowIso = new Date().toISOString();
    const patch: {
      status: PhotoStatus;
      approved_at?: string;
      deleted_at?: string;
    } = { status: data.status };
    if (data.status === "approved") patch.approved_at = nowIso;
    if (data.status === "deleted") patch.deleted_at = nowIso;

    const { error } = await admin.from("photos").update(patch).eq("id", data.photoId);
    if (error) throw new Error(error.message);

    // Resolve outstanding reports when the photo is decided.
    if (data.status !== "pending") {
      await admin
        .from("reports")
        .update({ resolved_at: new Date().toISOString(), resolved_by: context.userId })
        .eq("photo_id", data.photoId)
        .is("resolved_at", null);
    }

    await admin.from("audit_log").insert({
      actor_id: context.userId,
      action: `photo.${data.status}`,
      target_type: "photo",
      target_id: data.photoId,
    });

    return { ok: true };
  });

export interface AdminStats {
  totalApproved: number;
  pending: number;
  removed: number;
  totalLikes: number;
  reportsUnresolved: number;
}

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminStats> => {
    await assertAdmin(context.supabase as Supa, context.userId);
    const { getServiceClient } = await import("./photos.server");
    const admin = getServiceClient();

    const [approved, pending, removed, likes, reports] = await Promise.all([
      admin.from("photos").select("id", { count: "exact", head: true }).eq("status", "approved"),
      admin.from("photos").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("photos").select("id", { count: "exact", head: true }).eq("status", "deleted"),
      admin.from("likes").select("photo_id", { count: "exact", head: true }),
      admin.from("reports").select("id", { count: "exact", head: true }).is("resolved_at", null),
    ]);

    return {
      totalApproved: approved.count ?? 0,
      pending: pending.count ?? 0,
      removed: removed.count ?? 0,
      totalLikes: likes.count ?? 0,
      reportsUnresolved: reports.count ?? 0,
    };
  });