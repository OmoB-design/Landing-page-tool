import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ConnectPreview } from "@/components/features/dev/connect-preview";
import { Welcome } from "@/components/features/home/welcome";

export const metadata: Metadata = { title: "Illustrations" };

const WATCH = [
  "Each card loops while it's on screen, as Quality's in-app Home cards do; reduced motion shows a still.",
  "The pictures are drawn on Quality's 398 px canvas and scaled to the card (0.71), frames at Quality's positions, so the UI's real type sizes shrink in proportion.",
  "Add a brand: a close-up of LP's sidebar in its window (at Quality's 38, 31); a large cursor drifts to Brands, the row lights, and drifts back (4.5 s).",
  "Pick a template: the section editor in miniature in a browser frame (Quality's 20, 27, 358 wide); Reviews is carried above Benefits, the preview's sections swap, then it goes back.",
  "Create a page: Quality's browser frame to the decimal; the page builds in the brand (parts spring in 70 ms apart), Needs review lands, it holds, and it builds again.",
  "The pictures stay light in dark mode, as drawn.",
  "Connect pictures (I4): a page in the brand, a line to the service's mark, a green tick, a line on, then the result (Vercel's live address, Shopify's draft page). Once when seen, then they hold; reduced motion shows the end. They follow the theme.",
];

/**
 * /dev/illustrations (development only): the Home getting-started cards with their Stageshow
 * scenes (I1, D101), as Home draws them, and the connect pictures (I4), for review and for the
 * filming checks. Open without
 * signing in, in development only (lib/supabase/proxy.ts), so the filming tool can reach it.
 */
export default function IllustrationsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="min-h-dvh bg-surface-primary px-6 pt-12 pb-40">
      <div className="mx-auto flex max-w-home-row flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
            Illustrations
          </h1>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-type-body-small text-sub-text">
            {WATCH.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <Welcome name="Bolaji" />
        <ConnectPreview />
      </div>
    </main>
  );
}
