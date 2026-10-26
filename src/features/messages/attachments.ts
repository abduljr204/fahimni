import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, type AttachmentInput } from "@/domain/validation";

/** Longest side for uploaded photos: enough to read a textbook page, small enough to store. */
const MAX_IMAGE_SIDE = 1600;

export type AttachmentError = "type" | "size";

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function downscale(file: File): Promise<{ url: string; width: number; height: number; sizeBytes: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.82),
  );
  return { url: await readAsDataUrl(blob), width, height, sizeBytes: blob.size };
}

/**
 * Prepares a picked file for sending. In the prototype the file is kept as a data URL in
 * the browser; production uploads it to private storage and sends a reference instead.
 */
export async function toAttachment(file: File): Promise<AttachmentInput | AttachmentError> {
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_ATTACHMENT_BYTES) return "size";
  if (file.type === "application/pdf") {
    return { name: file.name, mimeType: "application/pdf", sizeBytes: file.size, url: await readAsDataUrl(file) };
  }
  const image = await downscale(file);
  const name = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
  return { name, mimeType: "image/jpeg", ...image };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
