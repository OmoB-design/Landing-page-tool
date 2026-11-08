"use client";

import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { toast } from "@/components/app/toaster";
import { AttachImageIcon, CloseIcon } from "@/components/ui/icons";
import { MorphText } from "@/components/ui/text-morph";
import { ATTACHABLE, attachable, shrink } from "@/lib/pages/attachments";
import { type LanderTarget, REQUEST_MAX } from "@/lib/pages/lander";
import { cn } from "@/lib/utils";
import { AGENT_IMAGES_MAX } from "@/lib/validators/agent";

import {
  IconButton,
  ListeningBars,
  MicButton,
  SendButton,
  StopButton,
  SWAP,
  TargetChip,
  useComposerText,
} from "./composer-parts";

/**
 * Lander's composer in its panel (B3.1b, D105; Sidekick's card, 20 px corners there, the app's card
 * radius here): the request on top, growing with what you write; under it, what it's about (the
 * selected section, × for the whole page), the count as you near the limit, the mic and the send
 * disc. Enter sends, Shift+Enter starts a new line. While Lander works, a soft ring runs round it
 * and the send disc becomes Stop. Pictures (B3.1d, up to three, for reference) come from the
 * attach button, a paste or a drop, sized down in the browser, and show as thumbnails over the
 * field until sent.
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
  onSend: (text: string, images: string[]) => void;
}) {
  const { text, setText, dictation } = useComposerText();
  const field = useRef<HTMLTextAreaElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  const [dropping, setDropping] = useState(false);

  const attach = async (files: File[]) => {
    const pictures = files.filter(attachable);
    if (files.length && !pictures.length) {
      toast.error("Pictures can be PNG, JPEG or WebP.");
      return;
    }
    const room = AGENT_IMAGES_MAX - images.length;
    if (pictures.length > room)
      toast(`Up to ${AGENT_IMAGES_MAX} pictures a request.`);
    const ready = await Promise.all(
      pictures
        .slice(0, Math.max(0, room))
        .map((file) => shrink(file).catch(() => null)),
    );
    const good = ready.filter((url): url is string => url !== null);
    if (good.length < ready.length) toast.error("A picture couldn’t be read.");
    if (good.length)
      setImages((now) => [...now, ...good].slice(0, AGENT_IMAGES_MAX));
  };

  useEffect(() => {
    if (focusSignal > 0) field.current?.focus();
  }, [focusSignal]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (dictation.listening) dictation.stop();
    if (!text.trim() || working) return;
    onSend(text.trim(), images);
    setText("");
    setImages([]);
  };

  const left = REQUEST_MAX - text.length;
  return (
    <form
      onSubmit={submit}
      data-working={working || undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) field.current?.focus();
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes("Files")) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDropping(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        void attach(Array.from(event.dataTransfer.files));
      }}
      className={cn(
        "lander-aura relative mx-3 mb-3 flex shrink-0 cursor-text flex-col gap-2 rounded-card bg-surface-primary p-3 shadow-pop ring-thin ring-stroke transition-shadow duration-200 ease-out focus-within:shadow-float",
        dropping && "ring-stroke-input-active",
      )}
    >
      {/* What it's about, at the top of the box (owner, 2026-11-06). */}
      <TargetChip target={target} onClear={onClearTarget} />
      <AnimatePresence initial={false}>
        {images.length ? (
          <motion.ul
            key="pictures"
            aria-label="Pictures to send"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="-mb-0.5 flex gap-2 overflow-hidden"
          >
            {images.map((url, i) => (
              <motion.li
                key={url.slice(-48)}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative size-12 shrink-0 overflow-hidden rounded-md ring-thin ring-stroke"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a picture being sent: a local data URL */}
                <img
                  src={url}
                  alt={`Picture ${i + 1}`}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove picture ${i + 1}`}
                  onClick={() =>
                    setImages((now) => now.filter((_, j) => j !== i))
                  }
                  className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-heading-01 text-surface-primary opacity-0 transition-opacity duration-150 outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CloseIcon aria-hidden className="size-2.5" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
      <label className="sr-only" htmlFor="lander-composer">
        Ask Buddy
      </label>
      <div className="relative flex flex-col">
        <textarea
          id="lander-composer"
          ref={field}
          rows={2}
          value={text}
          maxLength={REQUEST_MAX}
          readOnly={dictation.listening}
          placeholder={
            dictation.listening
              ? ""
              : hasThread
                ? "Add a follow-up"
                : "Ask Buddy to change the page"
          }
          onChange={(event) => setText(event.target.value)}
          onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 2)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.some(attachable)) {
              event.preventDefault();
              void attach(files);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape" && dictation.listening) dictation.stop();
          }}
          className={cn(
            "field-sizing-content max-h-40 min-h-10 resize-none bg-transparent px-0.5 text-type-body-small text-heading-01 outline-none placeholder:text-caption-1",
            // Once it scrolls, its top edge fades rather than cutting a line in half.
            scrolled && "lander-field-fade",
          )}
        />
        {dictation.listening && !text && !dictation.interim ? (
          // The recording signal and "Listening" on the field's first line, where the
          // placeholder was (B3.1h).
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0.5 top-0 flex h-5 items-center gap-1.5 text-type-body-small text-caption-1"
          >
            <ListeningBars />
            Listening
          </span>
        ) : null}
      </div>
      {dictation.listening && dictation.interim ? (
        <p className="-mt-1 px-0.5 text-type-caption-1 text-caption-1">
          {dictation.interim}
        </p>
      ) : null}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "ml-auto text-type-caption-2 text-heading-06 tabular-nums transition-opacity duration-150",
            left > 50 && "opacity-0",
          )}
        >
          <MorphText>{left}</MorphText>
        </span>
        <IconButton
          label={
            images.length >= AGENT_IMAGES_MAX
              ? `Up to ${AGENT_IMAGES_MAX} pictures`
              : "Attach a picture"
          }
          onClick={() => picker.current?.click()}
        >
          <AttachImageIcon aria-hidden className="size-4" />
        </IconButton>
        <input
          ref={picker}
          type="file"
          accept={ATTACHABLE.join(",")}
          multiple
          hidden
          onChange={(event) => {
            void attach(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
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
                label="Send to Buddy"
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
