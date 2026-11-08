"use client";

import { WorkingDots } from "@/components/app/working-dots";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";

import {
  CloseIcon,
  MicIcon,
  PagesIcon,
  SendIcon,
  StopIcon,
} from "@/components/ui/icons";
import { SectionChipIcon } from "@/components/ui/lp-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type LanderTarget, REQUEST_MAX } from "@/lib/pages/lander";
import { cn } from "@/lib/utils";

import { PartKindIcon } from "../section-panel";
import { useDictation } from "./use-dictation";

/** Two icons in one square: the old one blurs and shrinks away as the new one comes in. */
const SWAP = {
  initial: { opacity: 0, scale: 0.6, filter: "blur(2px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.6, filter: "blur(2px)" },
  transition: { duration: 0.2, ease: [0.32, 0.72, 0.24, 1] as const },
};

/**
 * A composer's text, with dictation: words you speak land in the field when a phrase ends (the
 * phrase still being heard shows grey under it). Requests are capped at the redraft note's length.
 */
export function useComposerText() {
  const [text, setText] = useState("");
  const append = useCallback((spoken: string) => {
    if (!spoken) return;
    setText((current) =>
      `${current}${current && !current.endsWith(" ") ? " " : ""}${spoken}`.slice(
        0,
        REQUEST_MAX,
      ),
    );
  }, []);
  const dictation = useDictation(append);
  return { text, setText, dictation };
}

/**
 * What a request is about (owner, 2026-11-06: like the file chip Claude Code shows inside a
 * message): a small chip at the top of the box, the part's icon and name, "Whole page" when it's
 * about all of it. In the composer it can be cleared back to the whole page.
 */
export function TargetChip({
  target,
  onClear,
}: {
  target: LanderTarget;
  onClear?: () => void;
}) {
  // The owner's section icon, 8 px (owner, 2026-11-06).
  // A part of a section (B4.4): its own icon and name ("Paragraph — Most cocktail…").
  const label = target ? (target.part?.name ?? target.label) : "Whole page";
  return (
    // The owner, 2026-11-06: as the file chip in Claude Code's chat (its size, weight, padding and
    // radius: 11 px regular, 6 px at the sides and 4 px above and below, 4 px corners, 24 px
    // tall), with the icon at 8 px; Foreground 01 with a thin stroke and a subtle shadow all
    // around, in the composer and in a sent request alike.
    <span className="flex max-w-full min-w-0 items-center gap-1 self-start rounded-xsm bg-foreground-01 px-1.5 py-1 text-type-caption-2 leading-4 font-normal text-heading-02 shadow-chip ring-thin ring-stroke-strong">
      {target?.part ? (
        <PartKindIcon
          part={target.part}
          className="size-2 shrink-0 text-icon-system"
        />
      ) : target ? (
        <SectionChipIcon
          aria-hidden
          className="size-2 shrink-0 text-icon-system"
        />
      ) : (
        <PagesIcon aria-hidden className="size-2 shrink-0 text-icon-system" />
      )}
      <span className="truncate">{label}</span>
      {target && onClear ? (
        <button
          type="button"
          aria-label={`Ask about the whole page instead of ${label}`}
          onClick={onClear}
          className="flex size-3 shrink-0 items-center justify-center rounded-xxs text-icon-system transition-colors duration-150 outline-none hover:bg-foreground-03 hover:text-body focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CloseIcon aria-hidden className="size-2.5" />
        </button>
      ) : null}
    </span>
  );
}

export function IconButton({
  label,
  shortcut,
  onClick,
  className,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-icon-system transition-colors duration-150 outline-none hover:bg-foreground-02 hover:text-body focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? (
          <kbd className="ml-1.5 font-sans text-caption-1">{shortcut}</kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Dictate: a mic, or while listening a stop square in a softly pulsing red ring. */
export function MicButton({
  listening,
  onToggle,
}: {
  listening: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      label={listening ? "Stop dictating" : "Dictate"}
      onClick={onToggle}
      className={cn(
        "relative transition-colors duration-200 ease-out",
        // Listening (B3.1h, owner): the Stop Buddy disc, in the bar's text colour (white on a dark
        // bar, black on a light one), with its square; no red, no pulsing ring.
        listening &&
          "bg-heading-01 text-surface-primary hover:bg-heading-02 hover:text-surface-primary",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={listening ? "stop" : "mic"}
          className="flex"
          {...SWAP}
        >
          {listening ? (
            <StopIcon aria-hidden className="size-3 fill-current" />
          ) : (
            <MicIcon aria-hidden className="size-4" />
          )}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  );
}

/**
 * The recording signal in small (B3.1h, the owner's reference): five rounded bars that rise and fall
 * out of step, beside "Listening" where Buddy isn't there to become them (his panel's composer).
 * Still bars under reduced motion.
 */
export function ListeningBars({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex h-3 items-center gap-0.5", className)}
    >
      {[0, 1, 2, 3, 4].map((k) => (
        <span
          key={k}
          className="listen-bar w-0.5 rounded-full bg-current"
          style={{ animationDelay: `${[-120, -480, -240, -600, -360][k]}ms` }}
        />
      ))}
    </span>
  );
}

/** Send: a dark disc with an arrow; a spinner while Lander works on the last request. */
export function SendButton({
  label,
  disabled,
  busy,
  size = "sm",
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="submit"
      aria-label={busy ? "Buddy is working" : label}
      disabled={disabled || busy}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-heading-01 text-surface-primary transition duration-150 ease-out outline-none hover:bg-heading-02 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:bg-foreground-03 disabled:text-heading-06 disabled:active:scale-100",
        size === "sm" ? "size-7" : "size-8",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={busy ? "busy" : "send"} className="flex" {...SWAP}>
          {busy ? <WorkingDots /> : <SendIcon aria-hidden className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** Stop on Lander's running request (B3.1c): the send disc's place while it works; a spinner
 * ring once pressed, until the request has stopped. */
export function StopButton({
  stopping,
  onStop,
  size = "sm",
}: {
  stopping: boolean;
  onStop: () => void;
  size?: "sm" | "md";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={stopping ? "Stopping" : "Stop Buddy"}
          disabled={stopping}
          onClick={onStop}
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-full bg-heading-01 text-surface-primary transition duration-150 ease-out outline-none hover:bg-heading-02 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:active:scale-100",
            size === "sm" ? "size-7" : "size-8",
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={stopping ? "stopping" : "stop"}
              className="flex"
              {...SWAP}
            >
              {stopping ? (
                <WorkingDots label="Stopping" />
              ) : (
                <StopIcon aria-hidden className="size-3 fill-current" />
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {stopping
          ? "Stopping after this step"
          : "Stop: what Buddy did so far is kept"}
      </TooltipContent>
    </Tooltip>
  );
}

export { SWAP };
