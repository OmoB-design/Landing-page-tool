import { cn } from "@/lib/utils";

/**
 * The spinner (Quality's, from its app bundle): a ring in the current text colour drawn as an arc
 * that grows round, flips and shrinks away. 16 px by default; size-3.5 in compact buttons. Beside
 * a label it's decorative; give it a `label` when it stands alone, and it becomes a status.
 */
export function Spinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      {...(label
        ? { role: "status", "aria-label": label }
        : { "aria-hidden": true })}
      className={cn("inline-block size-4 shrink-0 spinner", className)}
    />
  );
}
