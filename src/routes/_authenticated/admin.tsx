// Admin dashboard: queue (pending), approved list, stats.
// Every mutation goes through server functions gated by has_role('admin').

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  adminSetPhotoStatus,
  getAdminStats,
  listAdminQueue,
  type AdminPhoto,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/TopBar";

type QueueStatus = "pending" | "approved" | "deleted";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "RallyHub — Admin" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const [tab, setTab] = useState<QueueStatus>("pending");
  const queryClient = useQueryClient();

  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => getAdminStats() });
  const queue = useQuery({
    queryKey: ["admin", "queue", tab],
    queryFn: () => listAdminQueue({ data: { status: tab } }),
  });

  const setStatus = useMutation({
    mutationFn: (input: { photoId: string; status: QueueStatus }) =>
      adminSetPhotoStatus({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["best"] });
    },
  });

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
          <button
            onClick={() => supabase.auth.signOut().then(() => window.location.assign("/"))}
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatCard label="Approved" value={stats.data?.totalApproved} />
          <StatCard label="Pending" value={stats.data?.pending} />
          <StatCard label="Deleted" value={stats.data?.removed} />
          <StatCard label="Total likes" value={stats.data?.totalLikes} />
          <StatCard label="Open reports" value={stats.data?.reportsUnresolved} />
        </div>

        <div className="mt-6 flex gap-2">
          {(["pending", "approved", "deleted"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`rounded-full px-3 py-1.5 text-sm capitalize ${
                tab === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {(queue.data ?? []).map((photo) => (
            <AdminTile
              key={photo.id}
              photo={photo}
              tab={tab}
              onAction={(status) => setStatus.mutate({ photoId: photo.id, status })}
              busy={setStatus.isPending}
            />
          ))}
          {queue.data && queue.data.length === 0 ? (
            <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
              Nothing here.
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value ?? "—"}</div>
    </div>
  );
}

function AdminTile({
  photo,
  tab,
  onAction,
  busy,
}: {
  photo: AdminPhoto;
  tab: QueueStatus;
  onAction: (status: QueueStatus) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="aspect-square w-full bg-secondary">
        {photo.thumbUrl ? (
          <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
        <span>♥ {photo.likeCount}</span>
        {photo.unresolvedReports > 0 ? (
          <span className="text-destructive">⚑ {photo.unresolvedReports}</span>
        ) : null}
      </div>
      <div className="flex gap-1 border-t border-border p-1">
        {tab !== "approved" ? (
          <button
            disabled={busy}
            onClick={() => onAction("approved")}
            className="flex-1 rounded-sm bg-primary/10 py-1 text-xs text-primary hover:bg-primary/20"
          >
            Approve
          </button>
        ) : null}
        {tab !== "deleted" ? (
          <button
            disabled={busy}
            onClick={() => onAction("deleted")}
            className="flex-1 rounded-sm bg-destructive/10 py-1 text-xs text-destructive hover:bg-destructive/20"
          >
            Delete
          </button>
        ) : null}
        {tab === "deleted" ? (
          <button
            disabled={busy}
            onClick={() => onAction("pending")}
            className="flex-1 rounded-sm bg-secondary py-1 text-xs"
          >
            Restore
          </button>
        ) : null}
      </div>
    </div>
  );
}