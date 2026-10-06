// Single feed tile. Responsive aspect ratio from stored dimensions
// avoids layout shift while thumbnails load.

import { Link } from "@tanstack/react-router";
import type { FeedPhoto } from "@/lib/photos.functions";

export function PhotoTile({ photo }: { photo: FeedPhoto }) {
  const aspectRatio =
    photo.width && photo.height ? `${photo.width} / ${photo.height}` : "4 / 5";

  return (
    <Link
      to="/photo/$id"
      params={{ id: photo.id }}
      className="group relative block overflow-hidden rounded-[var(--radius-lg)] bg-card"
    >
      <div style={{ aspectRatio }} className="w-full">
        {photo.thumbUrl ? (
          <img
            src={photo.thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-xs text-white">
        <span className="opacity-80">
          {photo.location ?? ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <HeartIcon filled={photo.hasLiked} />
          {photo.likeCount}
        </span>
      </div>
    </Link>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}