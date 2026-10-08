import { formatDistanceToNowStrict } from "date-fns";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CloneIcon, ShieldIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// Small labels shown in list rows (DESIGN.md §3, "Right side of each row").

/** Human key such as LUM-23, in muted tabular figures. */
export function KeyLabel({ children }: { children: string }) {
  return (
    <span className="min-w-16 shrink-0 text-sm text-fg-muted tabular-nums">
      {children}
    </span>
  );
}

/** Owned (library) or Cloned (competitor page) origin. */
export function OriginBadge({ origin }: { origin: "owned" | "cloned" }) {
  return (
    <Badge
      variant="outline"
      className="h-5 rounded-xs border-border px-1.5 font-normal text-fg-muted"
    >
      {origin === "cloned" ? <CloneIcon aria-hidden /> : null}
      {origin === "cloned" ? "Cloned" : "Owned"}
    </Badge>
  );
}

export type ScoreTone = "good" | "fair" | "poor";

/** Residue score bands: at or above the publish threshold is good; up to 15 below is fair. */
export function scoreTone(score: number, min: number): ScoreTone {
  if (score >= min) return "good";
  if (score >= min - 15) return "fair";
  return "poor";
}

const TONE_CLASSES: Record<ScoreTone, string> = {
  good: "bg-success-soft text-success",
  fair: "bg-warning-soft text-warning",
  poor: "bg-danger-soft text-danger",
};

/** A clone's source-leak (residue) score, coloured against the publish threshold `min`. */
export function ScoreChip({ score, min }: { score: number; min: number }) {
  const tone = scoreTone(score, min);
  return (
    <Badge
      data-tone={tone}
      title={`Source-leak score ${score} (publish needs ${min}+)`}
      className={cn("h-5 rounded-xs px-1.5 tabular-nums", TONE_CLASSES[tone])}
    >
      <ShieldIcon aria-hidden />
      <span className="sr-only">Source-leak score </span>
      {score}
    </Badge>
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
    <span className="shrink-0 text-sm text-fg-muted tabular-nums">
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
      className="shrink-0 text-sm text-fg-muted tabular-nums"
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

/** Small avatar with initials; the assignee placeholder until profiles have pictures. */
export function PersonAvatar({ name }: { name: string }) {
  return (
    <Avatar size="sm" title={name} className="size-5">
      <AvatarFallback className="text-xs">
        <span aria-hidden>{initials(name)}</span>
        <span className="sr-only">{name}</span>
      </AvatarFallback>
    </Avatar>
  );
}
