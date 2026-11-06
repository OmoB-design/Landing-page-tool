"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { ComposerOpenIcon } from "@/components/ui/icons";
import { MorphText } from "@/components/ui/text-morph";
import { REQUEST_MAX } from "@/lib/pages/lander";
import { cn } from "@/lib/utils";

import {
  IconButton,
  MicButton,
  SendButton,
  SWAP,
  useComposerText,
} from "./composer-parts";
import { LanderMark } from "./lander-mark";

/** The bar's hints, in turn (owner, 2026-11-06): the shared " with Buddy" glides as they morph. */
const HINTS = [
  "Work with Buddy",
  "Think with Buddy",
  "Design with Buddy",
  "Write with Buddy",
  "Build with Buddy",
  "Polish with Buddy",
];
const HINT_EVERY_MS = 3200;

/**
 * "Work with Buddy" (B3.1b, D105; Shopify's Sidekick bar, docs/reference/sidekick-study.md): a pill
 * floating at the foot of the page, centred on it, with a thin ring and a soft lifting shadow.
 * Buddy, the field, the mic (or, once you type, the send disc in its place), a hairline, and the
 * panel button. While the field is empty its hint changes every 3.2 s ("Think with Buddy",
 * "Design with Buddy"…), morphing (torph) with a soft glint passing through the words; reduced
 * motion keeps "Work with Buddy". Enter sends and opens the panel with your request; the panel
 * button opens it empty. ⌘J also opens it.
 */
export function FloatingComposer({
  tone,
  working,
  onSend,
  onOpen,
}: {
  /** The bar's own look, against the page behind it (owner, 2026-11-06): "light" over a dark
   * page, "dark" over a light one; the app's theme until the page has said. */
  tone?: "light" | "dark";
  working: boolean;
  onSend: (text: string) => void;
  onOpen: () => void;
}) {
  const { text, setText, dictation } = useComposerText();
  const field = useRef<HTMLInputElement>(null);
  const [pointed, setPointed] = useState(false);
  // Clicked into: Buddy opens his mouth (owner, 2026-11-06).
  const [focused, setFocused] = useState(false);
  const typed = text.trim().length > 0;
  const reduced = useReducedMotion() ?? false;
  const [hint, setHint] = useState(0);
  const hinting = !text && !(dictation.listening && dictation.interim);
  useEffect(() => {
    if (!hinting || reduced || dictation.listening) return;
    const id = window.setInterval(
      () => setHint((h) => (h + 1) % HINTS.length),
      HINT_EVERY_MS,
    );
    return () => window.clearInterval(id);
  }, [hinting, reduced, dictation.listening]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (dictation.listening) dictation.stop();
    if (!typed) {
      onOpen();
      return;
    }
    onSend(text.trim());
    setText("");
  };

  return (
    <form
      onSubmit={submit}
      data-working={working || undefined}
      // Buddy goes wide-eyed while the pointer is over the bar (a mouse; not a tap).
      onPointerEnter={(event) =>
        event.pointerType === "mouse" && setPointed(true)
      }
      onPointerLeave={() => setPointed(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) =>
        !event.currentTarget.contains(event.relatedTarget) && setFocused(false)
      }
      className={cn(
        tone === "light" && "theme-light",
        tone === "dark" && "theme-dark",
        "lander-aura pointer-events-auto relative flex h-12.5 w-lander-bar max-w-full items-center gap-1.5 rounded-full bg-surface-primary pr-2.5 pl-3 shadow-lander-bar ring-thin ring-stroke transition-shadow duration-200 ease-out focus-within:shadow-lander-bar-lift",
      )}
    >
      <LanderMark working={working} excited={pointed} mouth={focused} />
      <label className="sr-only" htmlFor="lander-bar">
        Work with Buddy
      </label>
      <div className="relative flex h-full min-w-0 flex-1 items-center">
        <input
          id="lander-bar"
          ref={field}
          value={
            dictation.listening && dictation.interim
              ? `${text}${text ? " " : ""}${dictation.interim}`
              : text
          }
          maxLength={REQUEST_MAX}
          readOnly={dictation.listening}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && dictation.listening) dictation.stop();
          }}
          className="h-full w-full min-w-0 bg-transparent px-0.5 text-type-body-small text-heading-01 outline-none"
        />
        {hinting ? (
          // The hint, drawn over the empty field so it can morph (a placeholder can't).
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0.5 flex items-center text-type-body-small whitespace-nowrap text-caption-1"
          >
            {dictation.listening ? (
              "Listening…"
            ) : (
              <span
                className="buddy-hint"
                // A new glint with each hint: two names for the same sweep restart it in place.
                style={{
                  animationName:
                    hint === 0
                      ? "none"
                      : hint % 2
                        ? "buddy-glint-a"
                        : "buddy-glint-b",
                }}
              >
                <MorphText>{HINTS[hint] ?? HINTS[0]}</MorphText>
              </span>
            )}
          </span>
        ) : null}
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {typed && !dictation.listening ? (
          <motion.span key="send" className="flex" {...SWAP}>
            <SendButton label="Send to Buddy" disabled={false} busy={working} />
          </motion.span>
        ) : dictation.supported ? (
          <motion.span key="mic" className="flex" {...SWAP}>
            <MicButton
              listening={dictation.listening}
              onToggle={() =>
                dictation.listening
                  ? dictation.stop()
                  : (dictation.start(), field.current?.focus())
              }
            />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <span aria-hidden className="h-5 w-px shrink-0 bg-stroke" />
      <IconButton label="Open Buddy" shortcut="⌘J" onClick={onOpen}>
        <ComposerOpenIcon aria-hidden className="size-4" />
      </IconButton>
    </form>
  );
}
