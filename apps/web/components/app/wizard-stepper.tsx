import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type WizardStep = {
  id: string;
  label: string;
  /** Finished and valid: shows a tick. */
  done: boolean;
  /** Can be opened (every step before it is ready). */
  available: boolean;
};

/**
 * The create wizard's step bar (DESIGN.md WizardStepper): numbered steps across the top joined
 * by lines, a tick when done, the current step filled. Labels show when the bar is wide enough
 * (container query); narrow bars show "Step N of M · Label" with a progress line instead.
 */
export function WizardStepper({
  label,
  steps,
  current,
  onSelect,
}: {
  label: string;
  steps: WizardStep[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const index = steps.findIndex((s) => s.id === current);
  return (
    <nav aria-label={label} className="@container">
      <div className="flex flex-col gap-2 @2xl:hidden">
        <p className="text-sm text-fg-muted">
          Step {index + 1} of {steps.length} ·{" "}
          <span className="font-medium text-fg">{steps[index]?.label}</span>
        </p>
        <div
          aria-hidden
          className="h-1 overflow-hidden rounded-full bg-surface-muted"
        >
          <div
            className="h-full rounded-full bg-accent"
            // Progress through the steps (data, not styling).
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="hidden items-center @2xl:flex">
        {steps.map((step, i) => {
          const active = step.id === current;
          return (
            <li
              key={step.id}
              className="flex flex-1 items-center last:flex-none"
            >
              <button
                type="button"
                disabled={!step.available}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(step.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                  active
                    ? "font-medium text-fg"
                    : step.done
                      ? "text-fg enabled:hover:bg-surface-hover"
                      : "text-fg-subtle enabled:hover:bg-surface-hover enabled:hover:text-fg",
                )}
              >
                <StepMark index={i} active={active} done={step.done} />
                <span className={active ? undefined : "hidden @4xl:inline"}>
                  {step.label}
                </span>
                {step.done && !active ? (
                  <span className="sr-only"> (done)</span>
                ) : null}
              </button>
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-2 h-px min-w-4 flex-1",
                    step.done ? "bg-success" : "bg-border-strong",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepMark({
  index,
  active,
  done,
}: {
  index: number;
  active: boolean;
  done: boolean;
}) {
  if (active)
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-surface tabular-nums">
        {index + 1}
      </span>
    );
  if (done)
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-surface">
        <CheckIcon aria-hidden className="size-3.5" />
      </span>
    );
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-sm tabular-nums">
      {index + 1}
    </span>
  );
}
