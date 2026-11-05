import { ATTACHABLE, redraw } from "@/lib/pages/attachments";

/**
 * Pictures for the image studio (B3.2a, D109), prepared in the browser before they're uploaded:
 * at most 2400 px on the longest side (sharp on a retina hero), JPEGs as JPEG and PNG / WebP as
 * WebP so a cut-out product keeps its transparent background. That keeps a picture well inside
 * a request (the worker takes up to 8 MB; the website's requests stop near 4.5 MB).
 */
export const UPLOADABLE = ATTACHABLE;
const LONGEST = 2400;
/** The largest picture the browser sends, as a data URL (characters). */
const MAX_DATA_URL = 5_500_000;

export function uploadable(file: File): boolean {
  return UPLOADABLE.includes(file.type);
}

export async function prepareUpload(file: File): Promise<string> {
  const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  let url = await redraw(file, { longest: LONGEST, type, quality: 0.9 });
  if (url.length > MAX_DATA_URL)
    url = await redraw(file, { longest: 1800, type, quality: 0.82 });
  if (url.length > MAX_DATA_URL)
    throw new Error("That picture is too large. Try a smaller one.");
  return url;
}

/** What a version of an image came from, for its history. */
export const SOURCE_LABELS: Record<string, string> = {
  original: "From the build",
  product: "Product photo",
  reused: "From this page",
  uploaded: "Upload",
  generated: "Made with AI",
  edited: "Edited with AI",
};

/** An image's kind, as the panel names it. */
export const KIND_LABELS: Record<string, string> = {
  product: "Product photo",
  person: "Person",
  scene: "Scene",
  kept: "From the template",
  image: "Image",
};
