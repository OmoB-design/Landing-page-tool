import { Badge } from "@/components/ui/badge";

/** A count in a tinted blue badge (DESIGN.md §2). `noun` is read by screen readers only. */
export function CountBadge({ count, noun }: { count: number; noun: string }) {
  return (
    <Badge className="h-5 rounded-sm bg-accent-soft px-1.5 text-xs text-accent tabular-nums">
      {count}
      <span className="sr-only"> {noun}</span>
    </Badge>
  );
}
