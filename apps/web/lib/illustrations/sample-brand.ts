/**
 * The brand the Home card illustrations draw with until a workspace has its own (I1; I1b swaps in
 * the workspace's real brand). Lume is fictional; its product photo is the Varsity sneaker from
 * the dev workspace's Allbirds brand, trimmed (public/illustrations/sample-shoe.webp), for this
 * internal tool only. The colours are the brand's content, not interface tokens, so they live
 * here as data, as a real brand's palette lives in the database.
 */
export const SAMPLE_BRAND = {
  name: "Lume",
  /** What the user pastes, as the New brand field shows it. */
  website: "https://lumewear.com",
  /** Toasted tan, oat, charcoal, moss: read off the sneaker's own colours. */
  palette: ["#a3826a", "#efe7dc", "#2f2d2b", "#7d8467"],
  /** The heading face is the one the app already loads, so the page drawn below really uses it. */
  fonts: { heading: "Crimson Pro", body: "Inter" },
  voice: "Warm, plain-spoken",
  product: {
    name: "Varsity sneaker",
    price: "$145",
    image: "/illustrations/sample-shoe.webp",
    /** The image's own proportion (480 × 211). */
    aspect: 480 / 211,
  },
  audience: "Commuters",
  headline: "Comfort, dressed up",
} as const;

export type SampleBrand = typeof SAMPLE_BRAND;

/**
 * A made-up competitor page for the clone checklist's review on /dev/loaders (I3): the Replo
 * advertorial the worker's clone tests use. Its colours are the page's content, as above.
 */
export const SAMPLE_CLONE_SOURCE = {
  platform: "Replo",
  title: "Why 40,000 women switched | Vitalis",
  brandWords: ["Vitalis", "Vitalis Cardio"],
  palette: ["#a82420", "#f4b860", "#1b1b1b"],
} as const;
