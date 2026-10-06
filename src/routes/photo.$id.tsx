// Photo viewer: full-bleed original, like + report + share actions.

import { createFileRoute, Link, notFound, useNavigate, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { getPhotoDetails, reportPhoto, toggleLike } from "@/lib/photos.functions";
import { TopBar } from "@/components/TopBar";

const photoOptions = (id: string) =>
  queryOptions({
    queryKey: ["photo", id],
    queryFn: () => getPhotoDetails({ data: { id } }),
  });

export const Route = createFileRoute("/photo/$id")({
  head: () => ({
    meta: [{ title: "RallyHub — Photo" }],
  }),
  loader: async ({ params, context }) => {
    try {
      await context.queryClient.ensureQueryData(photoOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  component: PhotoViewer,
  notFoundComponent: () => (
    <div className="mx-auto mt-24 max-w-sm px-4 text-center">
      <p className="text-sm text-muted-foreground">Photo not found.</p>
      <Link to="/" className="mt-4 inline-block text-sm underline">
        Back to feed
      </Link>
    </div>
  ),
  errorComponent: ({ error, reset }: ErrorComponentProps) => (
    <div className="mx-auto mt-24 max-w-sm px-4 text-center">
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
      <button onClick={reset} className="mt-4 text-sm underline">
        Try again
      </button>
    </div>
  ),
});

function PhotoViewer() {
  const params = Route.useParams();
  const { data } = useSuspenseQuery(photoOptions(params.id));
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [reportSent, setReportSent] = useState(data.hasReported);

  const like = useMutation({
    mutationFn: () => toggleLike({ data: { photoId: data.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo", data.id] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["best"] });
    },
  });

  const report = useMutation({
    mutationFn: () => reportPhoto({ data: { photoId: data.id } }),
    onSuccess: () => setReportSent(true),
  });

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: "RallyHub photo" });
        return;
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const aspect =
    data.width && data.height ? `${data.width} / ${data.height}` : "4 / 5";

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-4">
        <button
          onClick={() => (window.history.length > 1 ? router.history.back() : navigate({ to: "/" }))}
          className="mb-3 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>

        <div
          className="overflow-hidden rounded-[var(--radius-lg)] bg-card"
          style={{ aspectRatio: aspect }}
        >
          {data.originalUrl ? (
            <img
              src={data.originalUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {formatCaption(data.day, data.location, data.createdAt)}
          </div>
          <div className="flex items-center gap-2">
            <ActionButton onClick={() => like.mutate()} disabled={like.isPending}>
              <HeartIcon filled={data.hasLiked} className="h-4 w-4" />
              <span>{data.likeCount}</span>
            </ActionButton>
            <ActionButton onClick={share}>Share</ActionButton>
            <ActionButton
              onClick={() => !reportSent && report.mutate()}
              disabled={reportSent || report.isPending}
              variant="ghost"
            >
              {reportSent ? "Reported" : "Report"}
            </ActionButton>
          </div>
        </div>
      </main>
    </>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "ghost";
}) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition disabled:opacity-50";
  const style =
    variant === "solid"
      ? "bg-secondary text-foreground hover:bg-secondary/80"
      : "text-muted-foreground hover:text-foreground";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      style={{ color: filled ? "var(--color-destructive)" : undefined }}
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}

function formatCaption(day: string | null, location: string | null, createdAt: string) {
  const parts: string[] = [];
  if (day) parts.push(day[0].toUpperCase() + day.slice(1));
  if (location) parts.push(location);
  const date = new Date(createdAt);
  parts.push(date.toLocaleDateString());
  return parts.join(" · ");
}