import { formatDistanceToNowStrict } from "date-fns";

import { ScoreShieldIcon } from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";

// Small labels shown in list rows (DESIGN.md §3, "Right side of each row").

/** Human key such as LUM-23, in muted tabular figures. */
export function KeyLabel({ children }: { children: string }) {
  return (
    <span className="min-w-16 shrink-0 text-type-caption-1 text-sub-text tabular-nums">
      {children}
    </span>
  );
}

/** Owned (library) or Cloned (competitor page) origin (Figma: a 0.7 px stroke tag, 12 px). */
export function OriginBadge({ origin }: { origin: "owned" | "cloned" }) {
  return (
    <span className="flex shrink-0 items-center rounded-sm px-1.5 text-type-caption-1 text-sub-text ring-thin ring-stroke">
      {origin === "cloned" ? "Cloned" : "Owned"}
    </span>
  );
}

export type ScoreTone = "good" | "fair" | "poor";

/** Residue score bands: at or above the publish threshold is good; up to 15 below is fair. */
export function scoreTone(score: number, min: number): ScoreTone {
  if (score >= min) return "good";
  if (score >= min - 15) return "fair";
  return "poor";
}

// Figma: the score chips in All Pages/states (light and dark). Poor uses Text-Danger, where the
// dark frame's dark red text on a dark red tint would be unreadable.
const TONE_CLASSES: Record<ScoreTone, string> = {
  good: "bg-tint-green text-highlight-green-500",
  fair: "bg-tint-yellow text-highlight-yellow-500",
  poor: "bg-tint-red text-text-danger",
};

/**
 * A clone's source-leak (residue) score, coloured against the publish threshold `min` (Figma:
 * an 18 px chip with 6 px corners, the 11 px shield and the score in 12 px, 2 px apart).
 */
export function ScoreChip({ score, min }: { score: number; min: number }) {
  const tone = scoreTone(score, min);
  return (
    <span
      data-tone={tone}
      title={`Source-leak score ${score} (publish needs ${min}+)`}
      className={cn(
        "flex h-4.5 shrink-0 items-center gap-0.5 rounded-sm px-1.5 text-type-caption-1 tabular-nums",
        TONE_CLASSES[tone],
      )}
    >
      <ScoreShieldIcon />
      <span className="sr-only">Source-leak score </span>
      {score}
    </span>
  );
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** $1.84; amounts under a cent but above zero read "<$0.01". */
export function formatCost(costUsd: number): string {
  if (costUsd > 0 && costUsd < 0.01) return "<$0.01";
  return usd.format(costUsd);
}

export function CostLabel({ costUsd }: { costUsd: number }) {
  return (
    <span className="shrink-0 text-type-caption-1 text-sub-text tabular-nums">
      <span className="sr-only">Cost </span>
      {formatCost(costUsd)}
    </span>
  );
}

/**
 * "5 minutes ago". Render on the server only: the text is fixed at request time, so a client
 * re-render would not match the server HTML.
 */
export function RelativeTime({ date }: { date: Date }) {
  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString("en-GB")}
      className="shrink-0 text-type-caption-1 text-sub-text tabular-nums"
    >
      {formatDistanceToNowStrict(date, { addSuffix: true })}
    </time>
  );
}

/** Up to two initials from a name ("Ada Lovelace" → "AL"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]];
  return (
    letters
      .map((part) => part?.charAt(0).toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "?"
  );
}

/**
 * A 22 px avatar with initials in 10 px (Figma: Page List); the creator until profiles have
 * pictures.
 */
export function PersonAvatar({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-foreground-02 text-type-caption-3 font-medium text-body"
    >
      <span aria-hidden>{initials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
