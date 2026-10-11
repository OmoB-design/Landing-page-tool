import { cn } from "@/lib/utils";

// Workspace, people and brand marks (D67; Figma side nav): a letter on one of eight avatar
// colours, picked from the name so the same name always gets the same colour.
const MARKS = [
  "bg-avatar-a",
  "bg-avatar-b",
  "bg-avatar-c",
  "bg-avatar-d",
  "bg-avatar-e",
  "bg-avatar-f",
  "bg-avatar-g",
  "bg-avatar-h",
] as const;

export function markColour(name: string): (typeof MARKS)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MARKS[hash % MARKS.length]!;
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

/** The workspace's mark: an 18 px rounded square, Geist 14 px letter (Figma: User Option). */
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
        "flex size-4.5 shrink-0 items-center justify-center overflow-hidden rounded-xsm font-mark text-type-body-large leading-none font-medium text-button-primary-text",
        markColour(name),
        className,
      )}
    >
      {initial(name)}
    </span>
  );
}

/** A brand's mark in the sidebar: a 16 px rounded square, Geist 12 px letter (Figma: Your brands). */
export function BrandNavMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-xsm font-mark text-type-caption-1 leading-none font-medium text-button-primary-text",
        markColour(name),
      )}
    >
      {initial(name)}
    </span>
  );
}

/** A round avatar with a person's initial (profile card and account menu: 30 px; Home: larger). */
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
        "flex size-7.5 shrink-0 items-center justify-center rounded-full font-mark text-type-body-large leading-none font-medium text-button-primary-text",
        markColour(name),
        className,
      )}
    >
      {initial(name)}
    </span>
  );
}
