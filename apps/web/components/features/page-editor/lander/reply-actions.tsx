"use client";

import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useRef, useState } from "react";

import {
  CheckIcon,
  CopyIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/components/ui/icons";
import { MorphText } from "@/components/ui/text-morph";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  type AgentFeedback,
  FEEDBACK_REASONS,
  type FeedbackReason,
} from "@/lib/validators/agent";

/**
 * Under a finished reply (B3.1e, D108; AffectUI's Message Actions): Copy (its text, the check
 * after), thumbs up and thumbs down, quiet until the reply is hovered or focused. A rating stays
 * lit, fills with a small pop, and pressing it again takes it back. Thumbs down unfolds quick
 * reasons and a note; sending them says thanks.
 */
export function ReplyActions({
  text,
  feedback,
  onRate,
}: {
  /** What Copy puts on the clipboard: the plan, the changes and the closing line. */
  text: string;
  feedback: AgentFeedback | null;
  onRate: (feedback: AgentFeedback | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reasons, setReasons] = useState<FeedbackReason[]>([]);
  const [note, setNote] = useState("");
  const [thanked, setThanked] = useState(false);
  // Opened at the foot of the thread, the form scrolls into view above the composer and its fade
  // (the thread's scroll padding) once it has unfolded (owner, 2026-11-05: it looked cut off).
  const form = useRef<HTMLFormElement>(null);
  const rating = feedback?.rating ?? null;

  const copy = () =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  const up = () => {
    setAsking(false);
    onRate(rating === "up" ? null : { rating: "up", reasons: [] });
  };
  const down = () => {
    if (rating === "down") {
      setAsking(false);
      onRate(null);
      return;
    }
    onRate({ rating: "down", reasons: [] });
    setReasons([]);
    setNote("");
    setThanked(false);
    setAsking(true);
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    onRate({ rating: "down", reasons, note: note.trim() || null });
    setAsking(false);
    setThanked(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "-ml-1 flex items-center gap-0.5 transition-opacity duration-150 group-focus-within/reply:opacity-100 group-hover/reply:opacity-100",
          rating || asking || thanked ? "opacity-100" : "opacity-0",
        )}
      >
        <Action label={copied ? "Copied" : "Copy"} onClick={copy}>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={copied ? "done" : "copy"}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              className="flex"
            >
              {copied ? (
                <CheckIcon aria-hidden className="size-3.5" />
              ) : (
                <CopyIcon aria-hidden className="size-3.5" />
              )}
            </motion.span>
          </AnimatePresence>
        </Action>
        <Action
          label={rating === "up" ? "Take back the thumbs up" : "Good reply"}
          pressed={rating === "up"}
          onClick={up}
        >
          <motion.span
            key={rating === "up" ? "on" : "off"}
            initial={rating === "up" ? { scale: 0.7 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", visualDuration: 0.3, bounce: 0.5 }}
            className="flex"
          >
            <ThumbsUpIcon
              aria-hidden
              className={cn("size-3.5", rating === "up" && "fill-current")}
            />
          </motion.span>
        </Action>
        <Action
          label={rating === "down" ? "Take back the thumbs down" : "Bad reply"}
          pressed={rating === "down"}
          onClick={down}
        >
          <motion.span
            key={rating === "down" ? "on" : "off"}
            initial={rating === "down" ? { scale: 0.7 } : false}
            animate={{ scale: 1 }}
            transition={{ type: "spring", visualDuration: 0.3, bounce: 0.5 }}
            className="flex"
          >
            <ThumbsDownIcon
              aria-hidden
              className={cn("size-3.5", rating === "down" && "fill-current")}
            />
          </motion.span>
        </Action>
        {thanked ? (
          <span className="pl-1 text-type-caption-2 text-heading-06">
            <MorphText>Thanks, that helps</MorphText>
          </span>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {asking ? (
          <motion.form
            key="why"
            ref={form}
            onSubmit={send}
            onAnimationComplete={(definition) => {
              const opened =
                typeof definition === "object" &&
                definition !== null &&
                "height" in definition &&
                definition.height === "auto";
              if (opened && typeof form.current?.scrollIntoView === "function")
                form.current.scrollIntoView({
                  block: "nearest",
                  behavior: "smooth",
                });
            }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0, 1] }}
            className="flex flex-col gap-2 overflow-hidden"
          >
            <p className="text-type-caption-1 text-sub-text">
              What went wrong?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FEEDBACK_REASONS.map((reason) => {
                const on = reasons.includes(reason.id);
                return (
                  <button
                    key={reason.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setReasons((all) =>
                        on
                          ? all.filter((r) => r !== reason.id)
                          : [...all, reason.id],
                      )
                    }
                    // Rings drawn inside: the unfolding form clips anything outside its box.
                    className="h-6 rounded-full px-2.5 text-type-caption-1 text-heading-02 ring-thin ring-stroke transition-colors duration-150 outline-none ring-inset hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-foreground-02 aria-pressed:ring-stroke-strong"
                  >
                    {reason.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor="lander-feedback-note">
                Anything else?
              </label>
              <input
                id="lander-feedback-note"
                value={note}
                maxLength={500}
                placeholder="Anything else? (optional)"
                onChange={(event) => setNote(event.target.value)}
                className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-2 text-type-caption-1 text-heading-01 ring-thin ring-stroke outline-none ring-inset placeholder:text-caption-1 focus:ring-stroke-input-active"
              />
              <button
                type="submit"
                aria-label="Send feedback"
                className="h-7 rounded-md bg-heading-01 px-2.5 text-type-caption-1 font-medium text-surface-primary transition-colors duration-150 outline-none ring-inset hover:bg-heading-02 focus-visible:ring-2 focus-visible:ring-ring"
              >
                Send
              </button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Action({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className="flex size-6 items-center justify-center rounded-md text-icon-system transition-colors duration-150 outline-none hover:bg-foreground-02 hover:text-body focus-visible:ring-2 focus-visible:ring-ring aria-pressed:text-heading-01"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
