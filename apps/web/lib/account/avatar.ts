/** Profile photos (B6.7, D139): the public `avatars` bucket, a folder per person. */
export const AVATAR_BUCKET = "avatars";
/** What you may choose: JPG, PNG, WebP or GIF, up to 5 MB (it's cropped and shrunk before it's sent). */
export const AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** The stored photo: a 256 px square, about 30 KB. */
export const AVATAR_SIZE = 256;

// Next inlines NEXT_PUBLIC_* at build time (read by its literal name; not via publicEnv, whose
// check would throw where it isn't set, as in component tests).
const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public`;

/** A stored photo's address, from its path in the bucket (`<user id>/<name>.webp`). */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${STORAGE}/${AVATAR_BUCKET}/${path}`;
}

/**
 * The chosen picture as the stored photo, in the browser: its middle square, AVATAR_SIZE px, as
 * WebP (JPEG where the browser can't make WebP). A GIF keeps its first frame.
 */
export async function squarePhoto(
  file: Blob,
  size = AVATAR_SIZE,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This picture couldn't be read.");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
  const webp = await encode("image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", 0.88);
  if (!jpeg) throw new Error("This picture couldn't be read.");
  return jpeg;
}
