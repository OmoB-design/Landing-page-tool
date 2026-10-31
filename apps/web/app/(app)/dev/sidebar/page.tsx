import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { RailTuner } from "@/components/features/dev/rail-tuner";

export const metadata: Metadata = { title: "Sidebar rail" };

const WATCH = [
  "The icons, the workspace mark and the brand marks never move; only the labels go.",
  "Opening: the column eases out on the drawer curve, then the labels arrive top to bottom, each fading in and sliding 4 px from the left.",
  "Search and Collapse fade in last, as one group.",
  "Closing: every label is gone in about 70 ms, then the column settles into the rail.",
  "In the rail: hover an icon for its name; the profile card is its picture.",
];

/**
 * /dev/sidebar (development only): replays the sidebar collapsing to its icon rail and opening
 * again (D97), with a panel to tune the timings live.
 */
export default function SidebarRailPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <>
      <PageHeader title="Sidebar rail" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-8 px-6 pt-12 pb-40">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
            Sidebar rail
          </h1>
          <p className="text-type-body-small leading-5 font-medium text-sub-text">
            Replay the sidebar closing to its icon rail and opening again. The
            panel tunes the timings on this page only; Slow motion stretches
            them all. Copy the panel’s settings to Claude to keep a tuning.
          </p>
        </div>
        <RailTuner />
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-type-body-small leading-5 text-body">
          {WATCH.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
