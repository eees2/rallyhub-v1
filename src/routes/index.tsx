// Home feed: newest-first, SSR-rendered first page, infinite scroll after.
// Public route — no auth gate.

import { createFileRoute, useNavigate, type ErrorComponentProps } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { listFeed, type FeedPage } from "@/lib/photos.functions";
import { TopBar } from "@/components/TopBar";
import { TermsPopup } from "@/components/TermsPopup";
import { SplashAnimation } from "@/components/SplashAnimation";
import { PhotoTile } from "@/components/PhotoTile";

const feedFirstPageOptions = queryOptions({
  queryKey: ["feed", "first"],
  queryFn: () => listFeed({ data: {} }),
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(feedFirstPageOptions),
  component: HomeFeed,
  errorComponent: FeedError,
});

function HomeFeed() {
  const { data: firstPage } = useSuspenseQuery(feedFirstPageOptions);
  const [pages, setPages] = useState<FeedPage[]>([firstPage]);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Keep local pagination state in sync when the first page is refetched.
  useEffect(() => {
    setPages((prev) => [firstPage, ...prev.slice(1)]);
  }, [firstPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const cursor = pages[pages.length - 1]?.nextCursor ?? null;
    if (!cursor) return;

    const observer = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting || loadingMore) return;
      setLoadingMore(true);
      try {
        const next = await listFeed({ data: { cursor } });
        setPages((prev) => [...prev, next]);
      } finally {
        setLoadingMore(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pages, loadingMore]);

  const photos = pages.flatMap((p) => p.photos);
  const hasMore = !!pages[pages.length - 1]?.nextCursor;

  return (
    <>
      <SplashAnimation />
      <TopBar />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-4">
        {photos.length === 0 ? (
          <EmptyState onUpload={() => navigate({ to: "/upload" })} />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} />
            ))}
          </div>
        )}

        {hasMore ? (
          <div ref={sentinelRef} className="flex justify-center py-8">
            <span className="text-xs text-muted-foreground">Loading more…</span>
          </div>
        ) : photos.length > 0 ? (
          <div className="flex justify-center py-8">
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["feed"] })}
              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Refresh
            </button>
          </div>
        ) : null}
      </main>
      <TermsPopup />
    </>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="mx-auto mt-24 max-w-sm text-center">
      <h1 className="text-2xl font-semibold tracking-tight">No photos yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Be the first fan to share a shot from the weekend.
      </p>
      <button
        onClick={onUpload}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Upload a photo
      </button>
    </div>
  );
}

function FeedError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto mt-24 max-w-sm px-4 text-center">
      <h1 className="text-lg font-semibold">Could not load the feed</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}