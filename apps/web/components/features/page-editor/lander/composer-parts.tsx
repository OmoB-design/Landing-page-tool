"use client";

import { WorkingDots } from "@/components/app/working-dots";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";

import { MicIcon, SendIcon, StopIcon } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { REQUEST_MAX } from "@/lib/pages/lander";
import { cn } from "@/lib/utils";

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
        "relative",
        listening &&
          "bg-highlight-red-50 text-spot-500-red hover:bg-highlight-red-50 hover:text-spot-500-red",
      )}
    >
      {listening ? (
        <span
          aria-hidden
          className="absolute inset-0 animate-live-pulse rounded-full ring-2 ring-highlight-red-150 motion-reduce:animate-none"
        />
      ) : null}
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
      aria-label={busy ? "Lander is working" : label}
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
          aria-label={stopping ? "Stopping" : "Stop Lander"}
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
          : "Stop: what Lander did so far is kept"}
      </TooltipContent>
    </Tooltip>
  );
}

export { SWAP };
