/**
 * Pictures attached to a request to Lander (B3.1d, D107), prepared in the browser: sized down so
 * their longest side is at most 1600 px and saved as JPEG, so three of them stay well inside a
 * request (the worker takes up to 3 MB each).
 */
export const ATTACHABLE = ["image/png", "image/jpeg", "image/webp"];
const LONGEST = 1600;

export function attachable(file: File): boolean {
  return ATTACHABLE.includes(file.type);
}

/** A picture as a JPEG data URL, at most 1600 px on its longest side (on white, for PNGs). */
export async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare pictures.");
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
