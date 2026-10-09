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
 * The create wizard's step list (DESIGN.md WizardStepper; vertical, like the reference tool):
 * numbered steps, a tick when done, the current step highlighted. Steps that can't be opened yet
 * are dimmed. `finalLabel` adds a last, never-clickable step (where the wizard hands over).
 */
export function WizardStepper({
  label,
  steps,
  current,
  onSelect,
  finalLabel,
}: {
  label: string;
  steps: WizardStep[];
  current: string;
  onSelect: (id: string) => void;
  finalLabel?: string;
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-col gap-1">
        {steps.map((step, index) => {
          const active = step.id === current;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!step.available}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(step.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "bg-accent-soft font-medium text-fg"
                    : "text-fg-muted enabled:hover:bg-surface-hover enabled:hover:text-fg",
                )}
              >
                <StepMark index={index} active={active} done={step.done} />
                {step.label}
                {step.done && !active ? (
                  <span className="sr-only"> (done)</span>
                ) : null}
              </button>
            </li>
          );
        })}
        {finalLabel ? (
          <li className="flex items-center gap-3 px-2 py-2 text-base text-fg-subtle">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-sm tabular-nums">
              {steps.length + 1}
            </span>
            {finalLabel}
          </li>
        ) : null}
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
