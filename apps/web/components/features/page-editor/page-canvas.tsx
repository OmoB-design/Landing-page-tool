"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { MonitorIcon, PhoneIcon } from "@/components/ui/icons";
import { TYPING_PAUSE_MS, lockedBlocks, textToSave } from "@/lib/pages/editor";
import { cn } from "@/lib/utils";

import { useDesk } from "../builds/desk-context";

export type Viewport = "desktop" | "phone";

/**
 * Show on page (B3.1b): lines to flash, once per `nonce`, scrolling the first into view, on the
 * first frame showing page `version` or later (a finished change flashes on the page it made, not
 * on the one still shown while that loads; 0 for the page as it is).
 */
export type FlashRequest = { nonce: number; blocks: number[]; version: number };

/**
 * The narrowest the page is laid out at in Desktop: a real desktop layout. A canvas narrower than
 * this (Lander or Sections open, a small window) zooms the page out to fit instead of reflowing it
 * into a tablet layout whose wide parts scroll sideways (owner, 2026-11-04). Phone is 390 px
 * (`--spacing-preview-mobile`), zoomed out only when the canvas is narrower still.
 */
export const DESKTOP_WIDTH = 1280;
const PHONE_WIDTH = 390;

/** The page version a frame's address loads (its `v`). */
function versionOf(address: string): number {
  return Number(/[?&]v=(\d+)/.exec(address)?.[1] ?? 0);
}

/** A line being typed: its number, what was saved last, and what's on the page now. */
type Line = { block: number; saved: string; text: string };

function highlight(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--color-highlight-yellow-500")
    .trim();
}

/**
 * The page editor's canvas (B3.1a, D104): the built page in a sandboxed frame running the write
 * bridge (`/preview/[id]?mode=write`). Click a line and type: it saves a second after you stop and
 * when you leave the line, through the desk's copy save (which checks the line still reads as it
 * did), and a line's saves share one undo step. Lines filled from data say so instead. Clicking a
 * section selects it, and selecting one elsewhere scrolls to it. The frame loads the page again
 * after any change but your own typing (which it already shows), keeping your place. While a
 * redraft runs, typing waits. `onSaving` tells the top bar a save is under way.
 *
 * B3.1b (D105): the canvas fills the editor (Desktop / Phone moved to the top bar); while Lander
 * rewrites, its lines breathe (`busyLines`), and Show on page flashes a change's lines (`flash`),
 * on the page that has them. A reload loads behind the page you see and takes
 * its place once it's ready and scrolled to your spot, so the canvas never goes blank.
 *
 * B3.2a (D109): clicking an image opens it in the image studio (`onImage`); the open one is
 * outlined (`image`), and a click anywhere else on the page closes it.
 */
export function PageCanvas({
  buildId,
  updatedAt,
  selected,
  onSelect,
  onSaving,
  onUpdating,
  onZoom,
  onUndo,
  onRedo,
  settleRef,
  viewport,
  busyLines,
  flash,
  image,
  onImage,
  busyImage,
}: {
  buildId: string;
  /** The build's last update as the editor opened (a rebuild), so the frame's address names one
   * version of it. */
  updatedAt: string;
  selected: string | null;
  onSelect: (key: string) => void;
  onSaving: (saving: boolean) => void;
  /** A newer page is loading behind the one shown (the top bar says so). */
  onUpdating: (updating: boolean) => void;
  /** How far the page is zoomed out to fit (1 when it isn't), for the top bar. */
  onZoom: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Set to a function that saves the line being typed and waits for every typing save, so the
   * editor's other changes go after them (on the version they made). */
  settleRef: React.RefObject<(() => Promise<void>) | null>;
  viewport: Viewport;
  busyLines: number[];
  flash: FlashRequest | null;
  /** The image open in the image studio (its `data-lp-img` number). */
  image: number | null;
  /** An image was clicked on the page (null: somewhere else was). */
  onImage: (number: number | null) => void;
  /** An image whose AI picture is being made: it breathes on the page (B3.2b). */
  busyImage: number | null;
}) {
  const { desk, saveTyping, frameVersion } = useDesk();
  const version = desk.build.page_version;
  // The build's last update as the editor opened: every desk change moves it too (a moment later,
  // through the refresh), which would load the same page twice. Rebuilds start from the review
  // desk, and a rebuild made while the editor is open shows once the editor opens again.
  const [rebuilt] = useState(updatedAt);
  // The frame loads again for every change but this tab's typing (which it already shows).
  const src = `/preview/${buildId}?mode=write&v=${frameVersion}&u=${encodeURIComponent(rebuilt)}`;
  // The frame you see, and the newest one loading behind it until it's ready (then it's shown).
  const [shown, setShown] = useState(src);
  const shownRef = useRef(src);
  const latest = useRef(src);
  useEffect(() => {
    latest.current = src;
  }, [src]);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const show = useCallback((next: string) => {
    shownRef.current = next;
    setShown(next);
  }, []);
  const updating = shown !== src;
  useEffect(() => {
    onUpdating(updating);
  }, [onUpdating, updating]);

  // The room the page has, and the width it's laid out at: Desktop never narrower than 1280 px,
  // zoomed out to fit; Phone 390 px.
  const well = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(
    null,
  );
  useEffect(() => {
    const element = well.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setRoom((r) =>
        r && r.width === width && r.height === height ? r : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layoutWidth =
    viewport === "phone"
      ? PHONE_WIDTH
      : Math.max(room?.width ?? 0, DESKTOP_WIDTH);
  const zoom =
    room && room.width > 0 ? Math.min(1, room.width / layoutWidth) : 1;
  useEffect(() => {
    onZoom(zoom);
  }, [onZoom, zoom]);
  const scrollY = useRef(0);
  // When the last flash was asked for, and the last one shown (its nonce): a flash waiting for its
  // page shows when that page is ready, within ten seconds.
  const flashAt = useRef(0);
  const flashed = useRef(0);
  const fromFrame = useRef(false);

  // What the frame needs whenever it (re)loads or the desk changes: the locked lines, whether
  // typing waits for a redraft, and where you were.
  const locked = lockedBlocks(desk.paragraphs);
  const paused = desk.redraft !== null;
  const setup = useRef({ locked, paused, busyLines, flash, image, busyImage });
  useEffect(() => {
    setup.current = { locked, paused, busyLines, flash, image, busyImage };
  });
  const post = useCallback(
    (message: Record<string, unknown>, to?: Window | null) => {
      const target =
        to ?? frames.current.get(shownRef.current)?.contentWindow ?? null;
      target?.postMessage({ colour: highlight(), ...message }, "*");
    },
    [],
  );

  // Typing: one line at a time, saved in order (each save carries the version the last returned).
  const line = useRef<Line | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const desks = useRef(desk);
  useEffect(() => {
    desks.current = desk;
  }, [desk]);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const current = line.current;
    if (!current) return;
    const text = textToSave(current.saved, current.text);
    if (text === null) return;
    const original = current.saved;
    current.saved = text;
    onSaving(true);
    queue.current = queue.current.then(async () => {
      const next = await saveTyping(current.block, original, text);
      if (!next) current.saved = original; // refused: the next pause tries from the old text
      onSaving(false);
    });
  }, [onSaving, saveTyping]);

  useEffect(() => {
    // A frame that's ready gets the locked lines, the pause, your place, the selection, the busy
    // lines, and a flash still waiting for its page.
    function greet(to: Window, address: string) {
      const now = setup.current;
      post(
        {
          type: "lp-setup",
          locked: now.locked,
          paused: now.paused,
          y: scrollY.current,
        },
        to,
      );
      post({ type: "lp-section-select", key: selected, scroll: false }, to);
      post({ type: "lp-busy", blocks: now.busyLines }, to);
      post({ type: "lp-image-select", number: now.image, scroll: false }, to);
      post({ type: "lp-image-busy", number: now.busyImage }, to);
      if (
        now.flash &&
        flashed.current !== now.flash.nonce &&
        versionOf(address) >= now.flash.version &&
        Date.now() - flashAt.current < 10_000
      ) {
        flashed.current = now.flash.nonce;
        post({ type: "lp-flash", blocks: now.flash.blocks, scroll: true }, to);
      }
    }
    function onMessage(event: MessageEvent) {
      const from = event.source as Window | null;
      if (!from) return;
      if (from !== frames.current.get(shownRef.current)?.contentWindow) {
        // The page loading behind: once ready it's set up and scrolled to your place ("lp-placed"),
        // then it takes the shown one's place.
        const next = latest.current;
        const incoming = frames.current.get(next)?.contentWindow;
        if (next === shownRef.current || from !== incoming) return;
        const type = (event.data as { type?: unknown } | null)?.type;
        if (type === "lp-ready") greet(from, next);
        else if (type === "lp-placed") show(next);
        return;
      }
      const data = event.data as {
        type?: unknown;
        key?: unknown;
        block?: unknown;
        text?: unknown;
        y?: unknown;
        number?: unknown;
      } | null;
      if (!data || typeof data.type !== "string") return;
      const block = typeof data.block === "number" ? data.block : null;
      const text = typeof data.text === "string" ? data.text : null;
      switch (data.type) {
        case "lp-ready":
          greet(from, shownRef.current);
          break;
        case "lp-scroll":
          if (typeof data.y === "number") scrollY.current = data.y;
          break;
        case "lp-section":
          if (typeof data.key === "string") {
            fromFrame.current = true;
            onSelect(data.key);
          }
          break;
        case "lp-start": {
          if (block === null || text === null) break;
          const paragraph = desks.current.paragraphs.find(
            (p) => p.number === block,
          );
          // The line must read on the page as the desk has it, or a save couldn't be matched.
          if (!paragraph || paragraph.text !== text) {
            line.current = null;
            toast.error(
              "This line can’t be typed in here. Edit it in the review desk’s Copy tab.",
            );
            break;
          }
          line.current = { block, saved: text, text };
          break;
        }
        case "lp-input":
          if (line.current && block === line.current.block && text !== null) {
            line.current.text = text;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, TYPING_PAUSE_MS);
          }
          break;
        case "lp-commit":
          if (line.current && block === line.current.block && text !== null) {
            line.current.text = text;
            if (
              textToSave(line.current.saved, text) === null &&
              /^\s*$/.test(text)
            )
              toast.error("A line needs words. Undo puts it back.");
            flush();
          }
          line.current = null;
          break;
        case "lp-cancel":
          if (timer.current) clearTimeout(timer.current);
          line.current = null;
          break;
        case "lp-image":
          onImage(typeof data.number === "number" ? data.number : null);
          break;
        case "lp-logo":
          toast(
            "The logo comes from the brand, so change it on the brand’s page.",
          );
          break;
        case "lp-locked":
          toast(
            "This line is filled from your brand or product, so change it there.",
          );
          break;
        case "lp-paused":
          toast("The page is being rewritten. Typing waits until that’s done.");
          break;
        case "lp-key":
          if (data.key === "undo") onUndo();
          else if (data.key === "redo") onRedo();
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [flush, onImage, onRedo, onSelect, onUndo, post, selected, show]);

  // A selection made outside the frame scrolls it into view; the desk's changes reach the frame.
  useEffect(() => {
    post({
      type: "lp-section-select",
      key: selected,
      scroll: !fromFrame.current,
    });
    fromFrame.current = false;
  }, [post, selected]);
  useEffect(() => {
    post({ type: "lp-setup", locked, paused });
    // `locked` is a new array each render; its contents follow the page's version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, paused, version]);
  useEffect(() => {
    post({ type: "lp-image-select", number: image, scroll: true });
  }, [post, image]);
  useEffect(() => {
    post({ type: "lp-image-busy", number: busyImage });
  }, [post, busyImage]);
  const busyKey = busyLines.join(",");
  useEffect(() => {
    post({
      type: "lp-busy",
      blocks: busyKey ? busyKey.split(",").map(Number) : [],
    });
  }, [post, busyKey]);
  useEffect(() => {
    if (!flash) return;
    flashAt.current = Date.now();
    // Shown now if the page on show is that version and no newer one is loading; otherwise the
    // page that is, once it's ready.
    const shownNow = shownRef.current;
    if (shownNow !== latest.current || versionOf(shownNow) < flash.version)
      return;
    flashed.current = flash.nonce;
    post({ type: "lp-flash", blocks: flash.blocks, scroll: true });
  }, [post, flash]);
  useEffect(() => {
    settleRef.current = async () => {
      flush();
      await queue.current;
    };
  }, [flush, settleRef]);
  // Leaving the editor mid-line still saves it.
  useEffect(() => () => flush(), [flush]);

  return (
    <section
      aria-label="Page"
      className="flex min-h-0 min-w-0 flex-1 flex-col p-3 lg:p-4"
    >
      <div
        ref={well}
        className="relative flex min-h-0 flex-1 justify-center overflow-hidden bg-foreground-02 p-3 ring-thin ring-stroke ring-inset dark:bg-surface-modal"
      >
        <AnimatePresence>
          {updating ? (
            <motion.span
              key="updating"
              aria-hidden
              className="canvas-updating z-10"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { delay: 0.15, duration: 0.2 },
              }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
            />
          ) : null}
        </AnimatePresence>
        <div
          className={cn(
            // Out of the flow, so the page's width never widens the editor; centred by margins
            // (a transform would blur the text).
            "absolute inset-3 mx-auto",
            !room && viewport === "phone" && "w-preview-mobile",
          )}
          // The page's width at its zoom (measured, not styling).
          style={room ? { width: Math.floor(layoutWidth * zoom) } : undefined}
        >
          {(updating ? [shown, src] : [src]).map((address) => {
            const loading = address !== shown;
            return (
              <iframe
                key={address}
                ref={(element) => {
                  if (element) frames.current.set(address, element);
                  else frames.current.delete(address);
                }}
                src={address}
                title={loading ? "The page, loading" : "The page, editable"}
                aria-hidden={loading || undefined}
                tabIndex={loading ? -1 : undefined}
                sandbox="allow-scripts"
                // A page that never says it's ready still replaces the old one once it has loaded.
                onLoad={
                  loading
                    ? () =>
                        setTimeout(() => {
                          if (
                            latest.current === address &&
                            shownRef.current !== address
                          )
                            show(address);
                        }, 400)
                    : undefined
                }
                // Laid out at its width and the height that fills the canvas once zoomed (measured).
                style={
                  room
                    ? {
                        width: layoutWidth,
                        height: room.height / zoom,
                        transform: zoom < 1 ? `scale(${zoom})` : undefined,
                      }
                    : undefined
                }
                className={cn(
                  "absolute top-0 left-0 origin-top-left border-0 bg-surface-primary",
                  !room && "h-full w-full",
                  viewport === "phone" && "border-x border-stroke",
                  loading && "pointer-events-none invisible",
                )}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Desktop / Phone (as the template editor's preview, Figma 739:16891), now in the top bar. */
export function ViewportSwitch({
  value,
  onChange,
}: {
  value: Viewport;
  onChange: (viewport: Viewport) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Page width"
      className="flex items-center rounded-md bg-foreground-03 p-0.5 ring-hair ring-stroke ring-inset dark:bg-foreground-01 dark:ring-0"
    >
      {(
        [
          ["desktop", "Desktop", MonitorIcon],
          ["phone", "Phone", PhoneIcon],
        ] as const
      ).map(([id, label, ViewIcon]) => (
        <Button
          key={id}
          variant="ghost"
          size="sm"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className="group/view h-6.5 gap-1 rounded-sm px-1.5 text-type-caption-1 font-medium text-heading-02 hover:bg-transparent hover:text-body aria-pressed:bg-surface-primary dark:text-sub-text dark:aria-pressed:bg-letter-paper dark:aria-pressed:text-body dark:aria-pressed:shadow-sm"
        >
          <ViewIcon
            aria-hidden
            className="size-3.5 text-icon-system group-aria-pressed/view:text-stroke-input-active"
          />
          <span className="sr-only xl:not-sr-only">{label}</span>
        </Button>
      ))}
    </div>
  );
}
