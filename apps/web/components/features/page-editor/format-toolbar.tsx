"use client";

import {
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
  ClearFormattingIcon,
  HighlightIcon,
  ItalicIcon,
  LinkIcon,
  StrikethroughIcon,
  TextBiggerIcon,
  TextColourIcon,
  TextSmallerIcon,
  UnderlineIcon,
  UnlinkIcon,
} from "@/components/ui/icons";
import {
  HIGHLIGHT_YELLOW,
  TEXT_BLACK,
  TEXT_WHITE,
} from "@/components/ui/text-colors";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";

import { cn } from "@/lib/utils";
import type {
  DeskPalette,
  FormatRange,
  TextFormat,
} from "@/lib/validators/desk";

/** Word's font sizes (its size box, and the steps Grow Font and Shrink Font take), in px. */
export const WORD_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72,
] as const;

/** Word's Grow Font: the next size in its list (past 72, the next ten). */
export function growSize(size: number): number {
  const next = WORD_SIZES.find((step) => step > size + 0.01);
  return next ?? Math.min(200, (Math.floor(size / 10) + 1) * 10);
}

/** Word's Shrink Font: the size before in its list (under 8, one smaller). */
export function shrinkSize(size: number): number {
  const before = [...WORD_SIZES].reverse().find((step) => step < size - 0.01);
  return before ?? Math.max(6, Math.floor(size) - 1);
}

/** What the selection has now, as the page reads it. */
export type Formats = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  link: string | null;
  color: string | null;
  highlight: string | null;
  size: number | null;
};

/** A selection on the page, with where it is over the canvas (px). */
export type CanvasSelection = {
  ranges: FormatRange[];
  rect: { x: number; y: number; w: number; h: number };
  formats: Formats;
  /** The canvas's size, to keep the toolbar inside it (and above "Work with Buddy"). */
  bounds: { width: number; height: number };
};

const HALF = 200; // about half the toolbar's width, to keep it inside the canvas
const TALL = 44; // the toolbar's height and its gap to the selection
const BAR_ZONE = 96; // the canvas's foot, where "Work with Buddy" floats

type Panel = "color" | "highlight" | "size" | "link" | null;

/**
 * The text formatting toolbar (B3.1g, D118; no Figma frame yet, after the Buddy bar with a
 * stronger edge and lift): it floats above the selection on the page (below it near the top) and
 * applies to exactly the characters selected, in one line or across several. Bold, italic,
 * underline and strikethrough (pressed when the whole selection has them), a link, text colour and
 * highlight (the brand's colours), Word's size box with Grow and Shrink, and Clear formatting. Each
 * change is one undoable step; ⌘B, ⌘I, ⌘U, ⌘⇧> and ⌘⇧< work on the page.
 */
export function FormatToolbar({
  selection,
  palette,
  busy,
  onFormat,
}: {
  selection: CanvasSelection | null;
  palette: DeskPalette | null;
  busy: boolean;
  onFormat: (format: TextFormat) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <AnimatePresence>
      {selection && inView(selection) ? (
        <Bar
          key="bar"
          selection={selection}
          palette={palette}
          busy={busy}
          reduced={reduced}
          onFormat={onFormat}
        />
      ) : null}
    </AnimatePresence>
  );
}

function Bar({
  selection,
  palette,
  busy,
  reduced,
  onFormat,
}: {
  selection: CanvasSelection;
  palette: DeskPalette | null;
  busy: boolean;
  reduced: boolean;
  onFormat: (format: TextFormat) => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [link, setLink] = useState(selection.formats.link ?? "");
  const { rect, formats, bounds } = selection;
  // Above the selection when there's room, else below it; always inside the canvas and clear of
  // the Buddy bar at its foot.
  const floor = bounds.height - BAR_ZONE;
  const above = rect.y - TALL > 8 || rect.y + rect.h + TALL > floor;
  const left = Math.max(
    HALF + 8,
    Math.min(bounds.width - HALF - 8, rect.x + rect.w / 2),
  );
  const top = above
    ? Math.max(TALL + 8, Math.min(floor, rect.y - 8))
    : Math.min(floor - TALL, rect.y + rect.h + 8);
  const size = formats.size ?? 16;
  const apply = (format: TextFormat) => {
    setPanel(null);
    onFormat(format);
  };
  const toggle = (next: Panel) =>
    setPanel((open) => (open === next ? null : next));
  const brand = palette
    ? [palette.primary, palette.dark, palette.tint, palette.accent]
    : [];
  const colours = unique([...brand, TEXT_BLACK, TEXT_WHITE]);
  const highlights = unique([
    ...(palette ? [palette.tint, palette.accent] : []),
    HIGHLIGHT_YELLOW,
  ]);

  return (
    <motion.div
      className="absolute z-30"
      // Where the selection is on the canvas (measured, not styling).
      style={{
        left,
        top,
        transformOrigin: above ? "bottom center" : "top center",
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        role="toolbar"
        aria-label="Text formatting"
        className={cn(
          "absolute left-0 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-surface-primary p-1 shadow-lander-bar-lift ring-1 ring-stroke-strong dark:ring-foreground-03",
          above ? "bottom-0" : "top-0",
          busy && "opacity-70",
        )}
      >
        <Tool
          label="Bold"
          keys="⌘B"
          pressed={formats.bold}
          disabled={busy}
          onClick={() => apply({ bold: !formats.bold })}
        >
          <BoldIcon aria-hidden className="size-4" strokeWidth={2.4} />
        </Tool>
        <Tool
          label="Italic"
          keys="⌘I"
          pressed={formats.italic}
          disabled={busy}
          onClick={() => apply({ italic: !formats.italic })}
        >
          <ItalicIcon aria-hidden className="size-4" />
        </Tool>
        <Tool
          label="Underline"
          keys="⌘U"
          pressed={formats.underline}
          disabled={busy}
          onClick={() => apply({ underline: !formats.underline })}
        >
          <UnderlineIcon aria-hidden className="size-4" />
        </Tool>
        <Tool
          label="Strikethrough"
          pressed={formats.strike}
          disabled={busy}
          onClick={() => apply({ strike: !formats.strike })}
        >
          <StrikethroughIcon aria-hidden className="size-4" />
        </Tool>
        <Divider />
        <Tool
          label={formats.link ? "Edit link" : "Link"}
          pressed={panel === "link" || Boolean(formats.link)}
          disabled={busy}
          onClick={() => toggle("link")}
        >
          <LinkIcon aria-hidden className="size-4" />
        </Tool>
        <Tool
          label="Text colour"
          pressed={panel === "color"}
          disabled={busy}
          onClick={() => toggle("color")}
        >
          <span className="relative flex size-4 flex-col items-center">
            <TextColourIcon aria-hidden className="size-4" />
            <span
              aria-hidden
              className="absolute -bottom-0.5 h-0.5 w-3.5 rounded-full"
              // The colour the selection has now (data, not styling).
              style={{ backgroundColor: formats.color ?? "currentColor" }}
            />
          </span>
        </Tool>
        <Tool
          label="Highlight"
          pressed={panel === "highlight" || Boolean(formats.highlight)}
          disabled={busy}
          onClick={() => toggle("highlight")}
        >
          <HighlightIcon aria-hidden className="size-4" />
        </Tool>
        <Divider />
        <button
          type="button"
          aria-label={`Text size, ${size} px`}
          aria-expanded={panel === "size"}
          title="Text size"
          disabled={busy}
          onClick={() => toggle("size")}
          className="flex h-7 min-w-12 items-center justify-between gap-0.5 rounded-lg px-1.5 text-type-caption-1 font-medium text-heading-02 tabular-nums ring-thin ring-stroke outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-expanded:bg-foreground-02"
        >
          {size}
          <ChevronDownIcon aria-hidden className="size-3 text-icon-system" />
        </button>
        <Tool
          label="Bigger"
          keys="⌘⇧>"
          disabled={busy}
          onClick={() => apply({ size: growSize(size) })}
        >
          <TextBiggerIcon aria-hidden className="size-4" />
        </Tool>
        <Tool
          label="Smaller"
          keys="⌘⇧<"
          disabled={busy}
          onClick={() => apply({ size: shrinkSize(size) })}
        >
          <TextSmallerIcon aria-hidden className="size-4" />
        </Tool>
        <Divider />
        <Tool
          label="Clear formatting"
          disabled={busy}
          onClick={() => apply({ clear: true })}
        >
          <ClearFormattingIcon aria-hidden className="size-4" />
        </Tool>

        {panel ? (
          <div
            className={cn(
              "absolute left-1/2 flex -translate-x-1/2 flex-col gap-1.5 rounded-lg bg-surface-modal p-2 shadow-float edge-hairline",
              above ? "bottom-full mb-1.5" : "top-full mt-1.5",
            )}
          >
            {panel === "color" ? (
              <Swatches
                label="Text colour"
                colours={colours}
                current={formats.color}
                none="Default"
                onPick={(color) => apply({ color })}
              />
            ) : panel === "highlight" ? (
              <Swatches
                label="Highlight"
                colours={highlights}
                current={formats.highlight}
                none="None"
                onPick={(highlight) => apply({ highlight })}
              />
            ) : panel === "size" ? (
              <ul
                aria-label="Text sizes"
                className="flex max-h-56 w-20 flex-col overflow-y-auto"
              >
                {WORD_SIZES.map((step) => (
                  <li key={step}>
                    <button
                      type="button"
                      onClick={() => apply({ size: step })}
                      className="flex w-full items-center justify-between rounded-xsm px-1.5 py-1 text-type-caption-1 font-medium text-heading-02 tabular-nums outline-none hover:bg-foreground-02 focus-visible:bg-foreground-02"
                    >
                      {step}
                      {Math.round(size) === step ? (
                        <CheckIcon aria-hidden className="size-3.5" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <form
                className="flex w-72 items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (link.trim()) apply({ link: link.trim() });
                }}
              >
                <label htmlFor="format-link" className="sr-only">
                  Web address
                </label>
                <input
                  id="format-link"
                  autoFocus
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://"
                  className="h-7 min-w-0 flex-1 rounded-md bg-surface-primary px-2 text-type-caption-1 text-heading-01 ring-thin ring-stroke outline-none ring-inset placeholder:text-caption-1 focus-visible:ring-stroke-input-active"
                />
                <button
                  type="submit"
                  disabled={!link.trim()}
                  className="h-7 rounded-md px-2 text-type-caption-1 font-medium text-heading-02 ring-thin ring-stroke outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  Apply
                </button>
                {formats.link ? (
                  <button
                    type="button"
                    aria-label="Remove link"
                    title="Remove link"
                    onClick={() => apply({ link: "" })}
                    className="flex size-7 items-center justify-center rounded-md text-icon-system outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UnlinkIcon aria-hidden className="size-4" />
                  </button>
                ) : null}
              </form>
            )}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

/** Part of the selection is on screen (scrolled away, the toolbar waits until it's back). */
function inView({ rect, bounds }: CanvasSelection): boolean {
  return rect.y + rect.h > 0 && rect.y < bounds.height - BAR_ZONE;
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((colour) => {
    const key = colour.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Tool({
  label,
  keys,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  keys?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={keys ? `${label} (${keys})` : label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-lg text-heading-02 outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring active:scale-97 disabled:opacity-50 aria-pressed:bg-foreground-03 aria-pressed:text-body"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-stroke-strong" />;
}

function Swatches({
  label,
  colours,
  current,
  none,
  onPick,
}: {
  label: string;
  colours: string[];
  current: string | null;
  none: string;
  onPick: (colour: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5">
      {colours.map((colour) => {
        const on = current?.toLowerCase() === colour.toLowerCase();
        return (
          <button
            key={colour}
            type="button"
            aria-label={colour}
            aria-pressed={on}
            title={colour}
            onClick={() => onPick(colour)}
            className="size-5 shrink-0 rounded-full ring-1 ring-stroke-strong outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-heading-02 aria-pressed:ring-offset-1 aria-pressed:ring-offset-surface-modal"
            // The swatch's own colour (data, not styling).
            style={{ backgroundColor: colour }}
          />
        );
      })}
      <button
        type="button"
        onClick={() => onPick("")}
        className="ml-0.5 h-6 rounded-md px-1.5 text-type-caption-1 font-medium text-heading-02 outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {none}
      </button>
    </div>
  );
}
