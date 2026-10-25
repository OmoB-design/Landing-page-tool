"use client";

import { type ComponentProps, type ReactNode, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { SparkleFigmaIcon } from "@/components/ui/lp-icons";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShimmerText } from "@/components/ui/shimmer-loader";
import { Spinner } from "@/components/ui/spinner";
import { redraftLabel } from "@/lib/builds/desk";

import { useDesk } from "./desk-context";

/**
 * Asks before a redraft (D86): what it rewrites and what stays, an optional note for the new words
 * ("shorter, more playful"), then Cancel or Redraft. Built in the Approve warning's style; to be
 * designed in Figma (/dev/build-states, state 12).
 */
export function RedraftPopover({
  title,
  detail,
  action = "Redraft",
  align = "end",
  onConfirm,
  children,
}: {
  title: string;
  detail: string;
  action?: string;
  align?: "start" | "center" | "end";
  onConfirm: (note: string) => void;
  /** The trigger. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const noteId = useId();
  const confirm = () => {
    setOpen(false);
    onConfirm(note.trim());
    setNote("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="flex w-menu-header flex-col gap-2.5 rounded-md bg-surface-primary p-3 text-type-caption-1 font-medium shadow-float edge-hairline"
      >
        <p className="text-heading-01">{title}</p>
        <p className="text-heading-05">{detail}</p>
        <label htmlFor={noteId} className="sr-only">
          A note for the new words (optional)
        </label>
        <Input
          id={noteId}
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirm();
            }
          }}
          placeholder="Optional note, e.g. shorter, more playful"
          className="h-8 px-2.5"
        />
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" size="compact" onClick={confirm}>
            <SparkleFigmaIcon className="size-3" />
            {action}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** "Redraft …": a small icon button that opens the RedraftPopover (Copy tab, sections). */
export function RedraftIconButton({
  label,
  disabled,
  ...props
}: { label: string; disabled?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="flex size-4.5 shrink-0 items-center justify-center rounded-xsm text-icon-system outline-none hover:text-heading-02 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
      {...props}
    >
      <SparkleFigmaIcon />
    </button>
  );
}

/**
 * While a redraft runs (D86): what it's rewriting, its latest step, and that changes wait. On
 * Foreground-01 like the panel's other cards; to be designed in Figma (state 13).
 */
export function RedraftStatus() {
  const { desk, redrafting } = useDesk();
  if (!redrafting) return null;
  const step = redrafting.job?.events.at(-1)?.message;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium"
    >
      <Spinner className="mt-0.5 size-3.5 shrink-0" label="Redrafting" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <ShimmerText className="text-heading-02">
          Redrafting {redraftLabel(redrafting.redraft, desk.sections)}…
        </ShimmerText>
        <span className="text-type-caption-2 text-heading-05">
          {step && redrafting.job?.status === "running"
            ? `${step}. `
            : redrafting.redraft.status === "queued"
              ? "Waiting for a worker. "
              : ""}
          Other changes wait until it’s done.
        </span>
      </div>
    </div>
  );
}
