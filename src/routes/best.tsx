// Best Shots: permanent Top 20 by like count, all-time.

import { createFileRoute, type ErrorComponentProps } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { listBestShots } from "@/lib/photos.functions";
import { TopBar } from "@/components/TopBar";
import { PhotoTile } from "@/components/PhotoTile";

const bestShotsOptions = queryOptions({
  queryKey: ["best"],
  queryFn: () => listBestShots(),
});

export const Route = createFileRoute("/best")({
  head: () => ({
    meta: [{ title: "RallyHub — Best Shots" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(bestShotsOptions),
  component: BestShots,
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

function BestShots() {
  const { data } = useSuspenseQuery(bestShotsOptions);

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-6">
        <div className="mb-6 px-1">
          <h1 className="text-2xl font-semibold tracking-tight">Best Shots</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The 20 most-loved photos across every rally weekend.
          </p>
        </div>
        {data.photos.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            No favourites yet. Give some photos a heart to shape this list.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.photos.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}