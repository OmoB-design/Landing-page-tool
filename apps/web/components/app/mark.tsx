import { cn } from "@/lib/utils";

// Workspace and people marks (D67): a letter on one of eight colours, picked from the name so
// the same name always gets the same colour.
const MARKS = [
  "bg-mark-a",
  "bg-mark-b",
  "bg-mark-c",
  "bg-mark-d",
  "bg-mark-e",
  "bg-mark-f",
  "bg-mark-g",
  "bg-mark-h",
] as const;

export function markColour(name: string): (typeof MARKS)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MARKS[hash % MARKS.length]!;
}

/** A rounded square with the workspace's first letter (sidebar, workspace menu). */
export function WorkspaceMark({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-xs text-xs font-semibold text-white",
        markColour(name),
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** A round avatar with a person's initial (account row, Home greeting). */
export function PersonMark({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white",
        markColour(name),
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
