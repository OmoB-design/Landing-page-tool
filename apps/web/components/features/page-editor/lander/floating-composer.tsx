"use client";

import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useRef } from "react";

import { ComposerOpenIcon } from "@/components/ui/icons";
import { REQUEST_MAX } from "@/lib/pages/lander";

import {
  IconButton,
  MicButton,
  SendButton,
  SWAP,
  useComposerText,
} from "./composer-parts";
import { LanderMark } from "./lander-mark";

/**
 * "Work with Lander" (B3.1b, D105; Shopify's Sidekick bar, docs/reference/sidekick-study.md): a pill
 * floating at the foot of the page, centred on it, with a Lander-purple ring so it reads over the
 * page in light and dark. Lander's mark, the field, the mic (or, once
 * you type, the send disc in its place), a hairline, and the panel button. Enter sends and opens the
 * panel with your request; the panel button opens it empty. ⌘J also opens it.
 */
export function FloatingComposer({
  working,
  onSend,
  onOpen,
}: {
  working: boolean;
  onSend: (text: string) => void;
  onOpen: () => void;
}) {
  const { text, setText, dictation } = useComposerText();
  const field = useRef<HTMLInputElement>(null);
  const typed = text.trim().length > 0;

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
      className="lander-aura pointer-events-auto relative flex h-12.5 w-lander-bar max-w-full items-center gap-1.5 rounded-full bg-surface-primary pr-2.5 pl-3 shadow-pop ring-thin ring-lander-bar-ring transition-shadow duration-200 ease-out focus-within:shadow-float"
    >
      <LanderMark working={working} />
      <label className="sr-only" htmlFor="lander-bar">
        Work with Lander
      </label>
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
        placeholder={dictation.listening ? "Listening…" : "Work with Lander"}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && dictation.listening) dictation.stop();
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-0.5 text-type-body-small text-heading-01 outline-none placeholder:text-caption-1"
      />
      <AnimatePresence initial={false} mode="popLayout">
        {typed && !dictation.listening ? (
          <motion.span key="send" className="flex" {...SWAP}>
            <SendButton
              label="Send to Lander"
              disabled={false}
              busy={working}
            />
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
      <IconButton label="Open Lander" shortcut="⌘J" onClick={onOpen}>
        <ComposerOpenIcon aria-hidden className="size-4" />
      </IconButton>
    </form>
  );
}
