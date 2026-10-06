// Upload flow: pick → compress client-side → request signed URLs →
// PUT to Storage → finalize. All server-authoritative.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";

import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  RALLY_DAYS,
  RALLY_LOCATIONS,
  type RallyDay,
} from "@/lib/constants";
import { compressImage } from "@/lib/image-compress";
import {
  finalizeUpload,
  requestUploadTarget,
  type UploadTarget,
} from "@/lib/photos.functions";
import { TopBar } from "@/components/TopBar";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [{ title: "RallyHub — Upload" }],
  }),
  component: UploadPage,
});

type Stage = "idle" | "compressing" | "uploading" | "finalizing" | "error";

function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [day, setDay] = useState<RallyDay | "">("");
  const [location, setLocation] = useState<string>("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const previewUrl = useMemo(() => preview, [preview]);

  const onPick = (nextFile: File | null) => {
    setError(null);
    if (!nextFile) return;
    if (!ALLOWED_MIME_TYPES.includes(nextFile.type as any)) {
      setError("Unsupported file type. Please choose a JPG, PNG, WebP, or HEIC.");
      return;
    }
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setError("That file is too large. Please choose one under 15 MB.");
      return;
    }
    setFile(nextFile);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(nextFile));
  };

  const onSubmit = async () => {
    if (!file) return;
    setError(null);
    setStage("compressing");
    try {
      const compressed = await compressImage(file);

      setStage("uploading");
      const target: UploadTarget = await requestUploadTarget({
        data: {
          contentType: compressed.contentType,
          byteSize: compressed.originalBlob.size,
        },
      });

      await Promise.all([
        putToSignedUrl(target.originalUploadUrl, compressed.originalBlob, compressed.contentType),
        putToSignedUrl(target.thumbUploadUrl, compressed.thumbBlob, compressed.thumbBlob.type || "image/webp"),
      ]);

      setStage("finalizing");
      const { id } = await finalizeUpload({
        data: {
          photoId: target.photoId,
          width: compressed.width,
          height: compressed.height,
          day: day || null,
          location: location.trim() ? location.trim() : null,
        },
      });

      navigate({ to: "/photo/$id", params: { id } });
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    }
  };

  const busy = stage === "compressing" || stage === "uploading" || stage === "finalizing";

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">
        <h1 className="text-xl font-semibold tracking-tight">Share a photo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only photos you took yourself. Everything is public and anonymous.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-6 flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-dashed border-border bg-card text-sm text-muted-foreground hover:border-primary hover:text-foreground"
          disabled={busy}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>Tap to choose a photo</span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />

        <div className="mt-5 space-y-3">
          <label className="block text-xs uppercase tracking-widest text-muted-foreground">
            Day (optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {RALLY_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(day === d ? "" : d)}
                className={`rounded-full px-3 py-1.5 text-sm capitalize ${
                  day === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <label className="block pt-3 text-xs uppercase tracking-widest text-muted-foreground">
            Location (optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {RALLY_LOCATIONS.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocation(location === loc ? "" : loc)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  location === loc
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {loc}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <button
          onClick={onSubmit}
          disabled={!file || busy}
          className="mt-6 w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {stage === "compressing"
            ? "Preparing…"
            : stage === "uploading"
              ? "Uploading…"
              : stage === "finalizing"
                ? "Publishing…"
                : "Publish photo"}
        </button>
      </main>
    </>
  );
}

async function putToSignedUrl(url: string, body: Blob, contentType: string) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType, "x-upsert": "true" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}). Please try again.`);
  }
}