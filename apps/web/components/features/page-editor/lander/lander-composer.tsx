"use client";

import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef } from "react";

import { CloseIcon } from "@/components/ui/icons";
import { type LanderTarget, REQUEST_MAX } from "@/lib/pages/lander";
import { cn } from "@/lib/utils";

import {
  MicButton,
  SendButton,
  StopButton,
  SWAP,
  useComposerText,
} from "./composer-parts";

/**
 * Lander's composer in its panel (B3.1b, D105; Sidekick's card, 20 px corners there, the app's card
 * radius here): the request on top, growing with what you write; under it, what it's about (the
 * selected section, × for the whole page), the count as you near the limit, the mic and the send
 * disc. Enter sends, Shift+Enter starts a new line. While Lander works, a soft ring runs round it
 * and sending waits (the send disc spins).
 */
export function LanderComposer({
  target,
  working,
  hasThread,
  stopping,
  onStop,
  focusSignal,
  onClearTarget,
  onSend,
}: {
  target: LanderTarget;
  working: boolean;
  hasThread: boolean;
  /** Stop was pressed on the running request. */
  stopping: boolean;
  onStop: () => void;
  /** Changes when the editor hands the composer a section: the field takes the focus. */
  focusSignal: number;
  onClearTarget: () => void;
  onSend: (text: string) => void;
}) {
  const { text, setText, dictation } = useComposerText();
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusSignal > 0) field.current?.focus();
  }, [focusSignal]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (dictation.listening) dictation.stop();
    if (!text.trim() || working) return;
    onSend(text.trim());
    setText("");
  };

  const left = REQUEST_MAX - text.length;
  return (
    <form
      onSubmit={submit}
      data-working={working || undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) field.current?.focus();
      }}
      className="lander-aura relative mx-3 mb-3 flex shrink-0 cursor-text flex-col gap-2 rounded-card bg-surface-primary p-3 shadow-pop ring-thin ring-stroke transition-shadow duration-200 ease-out focus-within:shadow-float"
    >
      <label className="sr-only" htmlFor="lander-composer">
        Ask Lander
      </label>
      <textarea
        id="lander-composer"
        ref={field}
        rows={2}
        value={text}
        maxLength={REQUEST_MAX}
        readOnly={dictation.listening}
        placeholder={
          dictation.listening
            ? "Listening…"
            : hasThread
              ? "Add a follow-up"
              : "Ask Lander to change the page"
        }
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape" && dictation.listening) dictation.stop();
        }}
        className="field-sizing-content max-h-40 min-h-10 resize-none bg-transparent px-0.5 text-type-body-small text-heading-01 outline-none placeholder:text-caption-1"
      />
      {dictation.listening && dictation.interim ? (
        <p className="-mt-1 px-0.5 text-type-caption-1 text-caption-1">
          {dictation.interim}
        </p>
      ) : null}
      <div className="flex items-center gap-1.5">
        {target ? (
          <span className="flex min-w-0 items-center gap-0.5 rounded-sm bg-foreground-02 py-0.5 pr-0.5 pl-1.5 text-type-caption-1 font-medium text-heading-02">
            <span className="truncate">{target.label}</span>
            <button
              type="button"
              aria-label={`Ask about the whole page instead of ${target.label}`}
              onClick={onClearTarget}
              className="flex size-4 shrink-0 items-center justify-center rounded-xsm text-icon-system transition-colors duration-150 outline-none hover:bg-foreground-03 hover:text-body focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CloseIcon aria-hidden className="size-3" />
            </button>
          </span>
        ) : (
          <span className="rounded-sm bg-foreground-02 px-1.5 py-0.5 text-type-caption-1 font-medium text-heading-02">
            Whole page
          </span>
        )}
        <span
          className={cn(
            "ml-auto text-type-caption-2 text-heading-06 tabular-nums transition-opacity duration-150",
            left > 50 && "opacity-0",
          )}
        >
          {left}
        </span>
        {dictation.supported ? (
          <MicButton
            listening={dictation.listening}
            onToggle={() =>
              dictation.listening
                ? dictation.stop()
                : (dictation.start(), field.current?.focus())
            }
          />
        ) : null}
        <AnimatePresence initial={false} mode="popLayout">
          {working ? (
            <motion.span key="stop" className="flex" {...SWAP}>
              <StopButton stopping={stopping} onStop={onStop} size="md" />
            </motion.span>
          ) : (
            <motion.span key="send" className="flex" {...SWAP}>
              <SendButton
                label="Send to Lander"
                size="md"
                disabled={!text.trim()}
                busy={false}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
