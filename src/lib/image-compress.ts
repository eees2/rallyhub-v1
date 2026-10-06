// Client-side image compression: keeps uploads snappy on mobile networks
// and shields the server from megapixel-heavy originals.

import {
  CLIENT_ENCODED_QUALITY,
  CLIENT_TARGET_LONG_EDGE,
  CLIENT_THUMB_LONG_EDGE,
} from "./constants";

export interface CompressedImage {
  originalBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
  contentType: "image/webp" | "image/jpeg";
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmapCompat(file);
  const { width, height } = bitmap;

  const largeCanvas = drawScaled(bitmap, CLIENT_TARGET_LONG_EDGE);
  const thumbCanvas = drawScaled(bitmap, CLIENT_THUMB_LONG_EDGE);
  bitmap.close?.();

  const supportsWebp = await canEncodeWebp();
  const contentType: CompressedImage["contentType"] = supportsWebp
    ? "image/webp"
    : "image/jpeg";

  const [originalBlob, thumbBlob] = await Promise.all([
    canvasToBlob(largeCanvas, contentType, CLIENT_ENCODED_QUALITY),
    canvasToBlob(thumbCanvas, "image/webp", 0.72).catch(() =>
      canvasToBlob(thumbCanvas, "image/jpeg", 0.72),
    ),
  ]);

  return {
    originalBlob,
    thumbBlob,
    width: largeCanvas.width,
    height: largeCanvas.height,
    contentType,
  };
}

function drawScaled(bitmap: ImageBitmap, longEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed."))),
      type,
      quality,
    );
  });
}

async function createImageBitmapCompat(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fallthrough
    }
  }
  const img = await loadImgElement(file);
  return await createImageBitmap(img);
}

function loadImgElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image."));
    };
    img.src = url;
  });
}

let webpSupport: boolean | null = null;
async function canEncodeWebp(): Promise<boolean> {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.5),
    );
    webpSupport = !!blob && blob.type === "image/webp";
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}