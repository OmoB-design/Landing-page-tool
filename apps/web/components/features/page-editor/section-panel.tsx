"use client";

import { AnimatePresence, motion, type Transition } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { IconAction } from "@/components/app/icon-action";
import {
  type DragHandleProps,
  SortableList,
} from "@/components/app/sortable-list";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  ChevronRightIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  RenameIcon,
  ImageIcon,
  PartButtonIcon,
  PartHeadingIcon,
  PartMediaIcon,
  PartTextIcon,
} from "@/components/ui/icons";
import {
  DuplicateFigmaIcon,
  GripDotsIcon,
  MoveDownFigmaIcon,
  MoveUpFigmaIcon,
  RemoveFigmaIcon,
  SectionIcon,
} from "@/components/ui/lp-icons";
import { Textarea } from "@/components/ui/textarea";
import { canMoveSection, keepsGroups } from "@/lib/pages/editor";
import { moved } from "@/lib/templates/editor";
import { cn } from "@/lib/utils";
import type {
  DeskParagraph,
  DeskSection,
  MapPart,
  PageParts,
  SectionAction,
} from "@/lib/validators/desk";

const CROSS_CONTAINER =
  "That section can't move there: it sits in a different part of the page.";

/** The tree's height while a panel is open (owner's recording of Shopify, 2026-11-06: the tree
 * shrinks to a strip of about four rows and the panel rises under it). Its top edge drags to
 * change that (B6.5, owner 2026-11-08): never under the heading and two rows, never leaving the
 * panel less than 200 px; remembered in this browser. */
const STRIP = 172;
const MIN_STRIP = 108;
const MIN_CARD = 200;
const STRIP_KEY = "lp-editor-strip";
const INSTANT: Transition = { duration: 0 };

const noSubscribe = () => () => {};

/** The strip's height from the owner's last drag in this browser, or STRIP. */
function savedStrip(): number {
  try {
    const saved = Number(localStorage.getItem(STRIP_KEY));
    return saved > 0 ? saved : STRIP;
  } catch {
    return STRIP;
  }
}

/** The strip's height between its limits, given the panel's room (0 while unmeasured). */
function clampStrip(height: number, room: number): number {
  const max = room > 0 ? Math.max(MIN_STRIP, room - MIN_CARD) : height;
  return Math.round(Math.min(Math.max(height, MIN_STRIP), max));
}

/**
 * The edit card's top edge as a handle (B6.5): a row-resize cursor and a short grip on hover or
 * focus; dragging moves the edge (the tree above grows or shrinks), arrow keys move it 16 px,
 * Home and End go to the limits, a double click puts it back.
 */
function StripHandle({
  strip,
  room,
  onDrag,
  onRelease,
  onSet,
}: {
  strip: number;
  room: number;
  /** While dragging: the height the pointer asks for. */
  onDrag: (height: number) => void;
  /** The drag ended: keep where it is. */
  onRelease: () => void;
  /** A key or a double click: go to this height and keep it. */
  onSet: (height: number) => void;
}) {
  const start = useRef<{ y: number; strip: number } | null>(null);
  const max = room > 0 ? Math.max(MIN_STRIP, room - MIN_CARD) : strip;
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the edit panel"
      aria-valuemin={MIN_STRIP}
      aria-valuemax={max}
      aria-valuenow={strip}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { y: event.clientY, strip };
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onDrag(start.current.strip + event.clientY - start.current.y);
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        start.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onRelease();
      }}
      onDoubleClick={() => onSet(STRIP)}
      onKeyDown={(event) => {
        const to =
          event.key === "ArrowUp"
            ? strip - 16
            : event.key === "ArrowDown"
              ? strip + 16
              : event.key === "Home"
                ? MIN_STRIP
                : event.key === "End"
                  ? max
                  : null;
        if (to === null) return;
        event.preventDefault();
        onSet(to);
      }}
      className="group absolute inset-x-2 -top-1 z-10 flex h-2 cursor-row-resize touch-none items-center justify-center outline-none"
    >
      <span className="h-0.75 w-8 rounded-max bg-stroke-strong opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:bg-spot-500-blue group-focus-visible:opacity-100 group-active:opacity-100" />
    </div>
  );
}

/** Something the tree or the page points at: a section, a line or a picture. */
export type PartPointer = {
  key?: string;
  line?: number;
  image?: number;
} | null;

/** The icon for a kind of part, as Shopify gives each block type its own. */
export function PartKindIcon({
  part,
  className,
}: {
  part: { kind: MapPart["kind"]; role?: string };
  className?: string;
}) {
  if (part.kind === "image")
    return <ImageIcon aria-hidden className={className} />;
  if (part.kind === "media")
    return <PartMediaIcon aria-hidden className={className} />;
  if (part.role === "cta")
    return <PartButtonIcon aria-hidden className={className} />;
  if (
    ["headline", "heading", "subheadline", "subheading"].includes(
      part.role ?? "",
    )
  )
    return <PartHeadingIcon aria-hidden className={className} />;
  return <PartTextIcon aria-hidden className={className} />;
}

function samePart(a: MapPart | null, b: MapPart | null) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "text") return a.line === b.line;
  if (a.kind === "image") return a.image === b.image;
  return a.excerpt === b.excerpt && a.name === b.name;
}

function partId(part: MapPart) {
  return part.kind === "text"
    ? `line-${part.line}`
    : part.kind === "image"
      ? `img-${part.image}`
      : `media-${part.name}-${part.excerpt}`;
}

/**
 * The page editor's left panel, laid out as Shopify's theme editor (B4.4, D123; the owner's
 * recording): the page's sections as a tree, each opening into its parts (texts, pictures,
 * buttons, videos, named as Shopify names their blocks), drag to reorder. Picking a section or a
 * part splits the panel: the tree shrinks to a strip at the top, scrolled to the row, and the
 * section's or part's panel rises under it (its words to edit, its actions, Ask Buddy); × puts the
 * tree back. Hovering a row outlines the part on the page, and hovering the page lights the row.
 */
export function SectionPanel({
  layout,
  paragraphs,
  parts,
  selected,
  part,
  open,
  hovered,
  busy,
  reduced,
  onSelect,
  onSelectPart,
  onClose,
  onHover,
  onEdit,
  onAsk,
  onType,
  expanded,
  onExpand,
  card,
}: {
  layout: DeskSection[];
  paragraphs: DeskParagraph[];
  /** Each section's parts (loaded with the page's version; undefined while loading). */
  parts: PageParts["sections"] | undefined;
  selected: string | null;
  part: MapPart | null;
  /** A section's or part's panel is open. */
  open: boolean;
  /** What the pointer is over on the page. */
  hovered: PartPointer;
  /** A change is saving or a redraft is running: section changes wait. */
  busy: string | null;
  reduced: boolean;
  onSelect: (key: string) => void;
  onSelectPart: (key: string, part: MapPart) => void;
  onClose: () => void;
  onHover: (target: PartPointer) => void;
  onEdit: (action: SectionAction) => void;
  onAsk: (key: string, part: MapPart | null) => void;
  /** Words typed in a part's panel: shown on the page at once, saved as typing is, against the
   * words the field started from (`original`). */
  onType: (line: number, text: string, done: boolean, original: string) => void;
  expanded: string[];
  onExpand: (key: string, open: boolean) => void;
  /** Buddy's panel motion (lander-motion.tsx): the card arrives and leaves as Buddy's panel. */
  card: {
    enter: Transition;
    exit: Transition;
    scaleFrom: number;
    blurFrom: number;
  };
}) {
  const keys = layout.map((s) => s.key);
  const index = layout.findIndex((s) => s.key === selected);
  const section = layout[index] ?? null;
  const tree = useRef<HTMLDivElement>(null);
  // The strip's height while a card is open: the owner's last drag in this browser, or STRIP.
  const root = useRef<HTMLDivElement>(null);
  const saved = useSyncExternalStore(noSubscribe, savedStrip, () => STRIP);
  const [moved, setMoved] = useState<number | null>(null);
  const [room, setRoom] = useState(0);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // Reports the panel's height on observing and whenever it changes.
    const seen = new ResizeObserver(() => setRoom(el.clientHeight));
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  const height = clampStrip(moved ?? saved, room);
  const keep = (value: number) => {
    try {
      localStorage.setItem(STRIP_KEY, String(value));
    } catch {
      // Storage blocked: it lasts until the page is closed.
    }
  };
  const drag = (next: number) => {
    setDragging(true);
    setMoved(clampStrip(next, room));
  };
  const release = () => {
    setDragging(false);
    keep(height);
  };
  const set = (next: number) => {
    const value = clampStrip(next, room);
    setDragging(false);
    setMoved(value);
    keep(value);
  };
  const partsOf = (key: string) =>
    parts?.find((s) => s.key === key)?.parts ?? [];

  // Once the panel has risen, the strip scrolls the chosen row into view (Shopify's, after the
  // split), smoothly unless motion is reduced.
  const chosenRow = part
    ? partId(part)
    : selected
      ? `section-${selected}`
      : null;
  useEffect(() => {
    if (!open || !chosenRow) return;
    const timer = setTimeout(
      () => {
        const row = tree.current?.querySelector<HTMLElement>(
          `[data-row="${CSS.escape(chosenRow)}"]`,
        );
        row?.scrollIntoView({
          block: "center",
          behavior: reduced ? "auto" : "smooth",
        });
      },
      reduced ? 0 : 260,
    );
    return () => clearTimeout(timer);
  }, [open, chosenRow, reduced]);

  const paragraph =
    part?.kind === "text"
      ? (paragraphs.find((p) => p.number === part.line) ?? null)
      : null;
  const lines = section
    ? paragraphs.filter((p) => p.section === section.key)
    : [];

  return (
    <div
      ref={root}
      className={cn(
        "relative flex h-full flex-col bg-surface-primary",
        dragging && "cursor-row-resize select-none",
      )}
    >
      <motion.div
        initial={false}
        animate={{ height: open ? height : "100%" }}
        transition={reduced || dragging ? INSTANT : { ...card.enter, delay: 0 }}
        className="flex min-h-0 shrink-0 flex-col"
      >
        <h2 className="flex h-11 shrink-0 items-center px-4 text-type-body-small font-medium">
          Sections · {layout.length}
        </h2>
        <div
          ref={tree}
          className="min-h-0 flex-1 scroll-fade-b overflow-y-auto px-2 pb-3"
          onMouseLeave={() => onHover(null)}
        >
          <SortableList
            ids={keys}
            label="Sections"
            itemName={(key) => layout.find((s) => s.key === key)?.label ?? key}
            disabled={Boolean(busy)}
            onReorder={(order, movedKey) => {
              if (!keepsGroups(layout, order)) {
                toast.error(CROSS_CONTAINER);
                return;
              }
              onEdit({ type: "reorder", keys: order, moved: movedKey });
            }}
            renderItem={(key, handle, { dragging }) => {
              const item = layout.find((s) => s.key === key);
              if (!item) return null;
              const isOpen = expanded.includes(key);
              const items = partsOf(key);
              return (
                <div>
                  <SectionRow
                    section={item}
                    chosen={key === selected && open && !part}
                    lit={
                      hovered?.key === key && !hovered.line && !hovered.image
                    }
                    expanded={isOpen}
                    expandable={parts === undefined || items.length > 0}
                    dragging={dragging}
                    handle={handle}
                    onSelect={() => onSelect(key)}
                    onToggle={() => onExpand(key, !isOpen)}
                    onHover={() => onHover({ key })}
                    onToggleHidden={
                      busy
                        ? undefined
                        : () =>
                            onEdit({ type: "hide", key, hidden: !item.hidden })
                    }
                  />
                  {isOpen ? (
                    <ul
                      role="list"
                      aria-label={`Parts of ${item.label}`}
                      className="pl-7"
                    >
                      {parts === undefined ? (
                        <li className="flex h-8 items-center pl-7 text-type-caption-1 text-sub-text">
                          Loading parts…
                        </li>
                      ) : (
                        items.map((p) => (
                          <li key={partId(p)}>
                            <PartRow
                              part={p}
                              chosen={open && samePart(part, p)}
                              lit={
                                (p.line != null && hovered?.line === p.line) ||
                                (p.image != null && hovered?.image === p.image)
                              }
                              onSelect={() => onSelectPart(key, p)}
                              onToggleHidden={
                                busy || (p.line == null && p.image == null)
                                  ? undefined
                                  : () =>
                                      onEdit({
                                        type: "hide",
                                        hidden: !p.hidden,
                                        ...(p.line != null
                                          ? { block: p.line }
                                          : { image: p.image ?? undefined }),
                                      })
                              }
                              onHover={() =>
                                onHover({
                                  key,
                                  line: p.line ?? undefined,
                                  image: p.image ?? undefined,
                                })
                              }
                            />
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
              );
            }}
          />
        </div>
      </motion.div>
      {/* The part's or section's card (owner, 2026-11-07: framed as Buddy's change card, filling
          the room under the strip, and arriving as Buddy's panel does: it scales up a little,
          fades and un-blurs in). The card leaving is taken out of the flow, so the tree grows back
          into its room at once. */}
      <AnimatePresence initial={false} mode="popLayout">
        {open && section ? (
          <motion.div
            key="panel"
            initial={{
              opacity: 0,
              scale: card.scaleFrom,
              filter: `blur(${card.blurFrom}px)`,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              filter: "blur(0px)",
              transition: card.enter,
            }}
            exit={{
              opacity: 0,
              scale: card.scaleFrom,
              filter: `blur(${card.blurFrom}px)`,
              transition: card.exit,
            }}
            style={{ transformOrigin: "top center" }}
            className="relative flex min-h-0 flex-1 flex-col px-2 pb-2"
          >
            <StripHandle
              strip={height}
              room={room}
              onDrag={drag}
              onRelease={release}
              onSet={set}
            />
            {part ? (
              <PartDetails
                key={partId(part)}
                part={part}
                section={section}
                paragraph={paragraph}
                busy={busy}
                onClose={onClose}
                onAsk={() => onAsk(section.key, part)}
                onType={onType}
              />
            ) : (
              <SectionDetails
                layout={layout}
                index={index}
                lines={lines}
                busy={busy}
                onClose={onClose}
                onEdit={onEdit}
                onAsk={() => onAsk(section.key, null)}
              />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * A section's row (the owner's recording of Shopify's sidebar, 2026-11-07): the chevron at the
 * left with its own grey square on hover, then the section's icon, which turns into the grip that
 * moves the section while the row is hovered (its own grey square when the pointer is on it),
 * then the name.
 */
function SectionRow({
  section,
  chosen,
  lit,
  expanded,
  expandable,
  dragging,
  handle,
  onSelect,
  onToggle,
  onHover,
  onToggleHidden,
}: {
  section: DeskSection;
  chosen: boolean;
  lit: boolean;
  expanded: boolean;
  expandable: boolean;
  dragging: boolean;
  handle: DragHandleProps;
  onSelect: () => void;
  onToggle: () => void;
  onHover: () => void;
  /** Shopify's eye; undefined while changes wait. */
  onToggleHidden?: () => void;
}) {
  const tone = chosen ? "text-button-primary-text" : "text-icon-system";
  const square = chosen
    ? "hover:bg-button-primary-active"
    : "hover:bg-foreground-03";
  return (
    <div
      data-row={`section-${section.key}`}
      onMouseEnter={onHover}
      className={cn(
        "group/row relative flex h-8 items-center gap-0.5 rounded-md pl-1 transition-colors duration-100 ease-out",
        chosen
          ? "bg-button-primary text-button-primary-text"
          : lit
            ? "bg-foreground-02"
            : "hover:bg-foreground-02",
        dragging && "bg-surface-primary shadow-pop",
      )}
    >
      <button
        type="button"
        aria-label={`${expanded ? "Close" : "Open"} ${section.label}`}
        aria-expanded={expanded}
        disabled={!expandable}
        onClick={onToggle}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-xsm transition-colors duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-0",
          tone,
          square,
        )}
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "size-3.5 transition-transform duration-150 ease-out",
            expanded && "rotate-90",
          )}
        />
      </button>
      <span
        {...handle}
        aria-label={`Move ${section.label}`}
        className={cn(
          "relative flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-xsm transition-colors duration-100 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
          tone,
          square,
        )}
      >
        <SectionIcon
          aria-hidden
          className="size-3.5 group-hover/row:opacity-0 group-has-focus-visible/row:opacity-0"
        />
        <GripDotsIcon
          aria-hidden
          className="absolute size-3.5 opacity-0 group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100"
        />
      </span>
      <button
        type="button"
        aria-current={chosen || undefined}
        onClick={onSelect}
        className="flex h-full min-w-0 flex-1 items-center rounded-md pr-2.5 pl-1.5 text-left text-type-caption-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            section.hidden && !chosen && "text-sub-text",
          )}
        >
          {section.label}
        </span>
      </button>
      <EyeButton
        name={section.label}
        hidden={section.hidden}
        chosen={chosen}
        row="row"
        onClick={onToggleHidden}
      />
    </div>
  );
}

/** Shopify's eye at a row's right: shown while the row is hovered, and always (crossed out) while
 * the section or part is hidden; a click hides or shows it on the page. */
function EyeButton({
  name,
  hidden,
  chosen,
  row,
  onClick,
}: {
  name: string;
  hidden: boolean;
  chosen: boolean;
  row: "row" | "part";
  onClick?: () => void;
}) {
  if (!onClick && !hidden) return null;
  return (
    <button
      type="button"
      aria-label={`${hidden ? "Show" : "Hide"} ${name}`}
      aria-pressed={hidden}
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        "mr-1 flex size-6 shrink-0 items-center justify-center rounded-xsm transition duration-100 ease-out outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
        chosen
          ? "text-button-primary-text hover:bg-button-primary-active"
          : "text-icon-system hover:bg-foreground-03 hover:text-body",
        hidden
          ? "opacity-100"
          : row === "row"
            ? "opacity-0 group-hover/row:opacity-100"
            : "opacity-0 group-hover/part:opacity-100",
      )}
    >
      {hidden ? (
        <EyeOffIcon aria-hidden className="size-3.5" />
      ) : (
        <EyeIcon aria-hidden className="size-3.5" />
      )}
    </button>
  );
}

/**
 * A part's row: as Shopify's, its fill starts under the section's icon and its own icon (or the
 * picture's thumbnail) under the section's name.
 */
function PartRow({
  part,
  chosen,
  lit,
  onSelect,
  onHover,
  onToggleHidden,
}: {
  part: MapPart;
  chosen: boolean;
  lit: boolean;
  onSelect: () => void;
  onHover: () => void;
  /** Shopify's eye; undefined while changes wait (or for a video, which can't be hidden yet). */
  onToggleHidden?: () => void;
}) {
  const tone = chosen ? "text-button-primary-text" : "text-icon-system";
  return (
    <div
      data-row={partId(part)}
      onMouseEnter={onHover}
      className={cn(
        "group/part relative flex h-8 items-center rounded-md transition-colors duration-100 ease-out",
        chosen
          ? "bg-button-primary text-button-primary-text"
          : lit
            ? "bg-foreground-02"
            : "hover:bg-foreground-02",
      )}
    >
      <button
        type="button"
        aria-current={chosen || undefined}
        onClick={onSelect}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pr-1 pl-7 text-left text-type-caption-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Shopify's: hovered, the part's icon becomes a lock (parts keep their place in the
            section; the section moves as a whole). */}
        <span className="relative flex size-3.5 shrink-0 items-center justify-center">
          {part.kind === "image" && part.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- the page's own picture, from anywhere it's hosted
            <img
              src={part.thumb}
              alt=""
              loading="lazy"
              className={cn(
                "size-3.5 rounded-xxs object-cover ring-thin ring-stroke group-hover/part:opacity-0",
                part.hidden && "opacity-50",
              )}
            />
          ) : (
            <PartKindIcon
              part={part}
              className={cn("size-3.5 group-hover/part:opacity-0", tone)}
            />
          )}
          <LockIcon
            aria-hidden
            className={cn(
              "absolute size-3.5 opacity-0 group-hover/part:opacity-100",
              tone,
            )}
          />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            part.hidden && !chosen && "text-sub-text",
          )}
        >
          {part.name}
          {part.excerpt && part.kind !== "media" ? (
            <span className={cn("italic", !chosen && "text-sub-text")}>
              {" "}
              — {part.excerpt}
            </span>
          ) : null}
        </span>
      </button>
      <EyeButton
        name={part.name}
        hidden={part.hidden}
        chosen={chosen}
        row="part"
        onClick={onToggleHidden}
      />
    </div>
  );
}

/** The frame of a section's or part's panel, as Buddy's change card: a Foreground-01 head with the
 * icon, the name and where it is, the body, and a foot with Ask Buddy to edit. It fills the room
 * under the tree's strip. */
function PanelCard({
  icon,
  title,
  meta,
  onClose,
  onAsk,
  askDisabled,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  onClose: () => void;
  onAsk: () => void;
  askDisabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-item bg-surface-primary shadow-light ring-thin ring-stroke"
    >
      <header className="flex h-9 shrink-0 items-center gap-2 bg-foreground-01 pr-1 pl-3">
        {icon}
        <h3 className="flex min-w-0 flex-1 items-baseline gap-1 text-type-caption-1">
          <span className="min-w-0 truncate font-medium text-heading-02">
            {title}
          </span>
          <span className="shrink-0 text-sub-text">· {meta}</span>
        </h3>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-icon-system transition-colors duration-150 outline-none hover:bg-foreground-03 hover:text-body focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CloseIcon aria-hidden className="size-3.5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {children}
      </div>
      <footer className="flex h-10 shrink-0 items-center gap-1 bg-foreground-01 px-1.5 divider-t-half">
        <Button
          variant="ghost"
          size="sm"
          disabled={askDisabled}
          onClick={onAsk}
          className="h-7 gap-1.5 px-1.5 text-type-caption-1 text-heading-02 hover:bg-foreground-03"
        >
          <RenameIcon aria-hidden className="size-3.5 text-icon-system" />
          Ask Buddy to edit
        </Button>
      </footer>
    </section>
  );
}

/** A section's panel: its place and actions (by the template's rules) and Ask Buddy. */
function SectionDetails({
  layout,
  index,
  lines,
  busy,
  onClose,
  onEdit,
  onAsk,
}: {
  layout: DeskSection[];
  index: number;
  lines: DeskParagraph[];
  busy: string | null;
  onClose: () => void;
  onEdit: (action: SectionAction) => void;
  onAsk: () => void;
}) {
  const section = layout[index];
  const keys = layout.map((s) => s.key);
  const editable = lines.filter((p) => !p.locked).length;
  if (!section) return null;
  return (
    <PanelCard
      icon={
        <SectionIcon
          aria-hidden
          className="size-3.5 shrink-0 text-icon-system"
        />
      }
      title={section.label}
      meta={`Section ${index + 1} of ${layout.length}`}
      onClose={onClose}
      onAsk={onAsk}
      askDisabled={Boolean(busy) || editable === 0}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-type-caption-1 text-sub-text tabular-nums">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
          {editable < lines.length
            ? ` · ${lines.length - editable} filled from data`
            : ""}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <IconAction
            icon={MoveUpFigmaIcon}
            label="Move up"
            unavailable={
              busy ??
              (canMoveSection(layout, index, -1)
                ? null
                : index === 0
                  ? "Already at the top"
                  : "It can't move past the section above (a different part of the page)")
            }
            onClick={() =>
              onEdit({
                type: "reorder",
                keys: moved(keys, index, -1),
                moved: section.key,
              })
            }
          />
          <IconAction
            icon={MoveDownFigmaIcon}
            label="Move down"
            unavailable={
              busy ??
              (canMoveSection(layout, index, 1)
                ? null
                : index === layout.length - 1
                  ? "Already at the bottom"
                  : "It can't move past the section below (a different part of the page)")
            }
            onClick={() =>
              onEdit({
                type: "reorder",
                keys: moved(keys, index, 1),
                moved: section.key,
              })
            }
          />
          <IconAction
            icon={DuplicateFigmaIcon}
            label="Duplicate"
            unavailable={
              busy ??
              (section.duplicable ? null : "This section can't be duplicated")
            }
            onClick={() => onEdit({ type: "duplicate", key: section.key })}
          />
          <IconAction
            icon={RemoveFigmaIcon}
            label="Remove"
            unavailable={
              busy ??
              (!section.removable
                ? "This section can't be removed"
                : layout.length === 1
                  ? "A page needs at least one section"
                  : null)
            }
            onClick={() => onEdit({ type: "remove", key: section.key })}
          />
        </div>
      </div>
      <span className="text-type-caption-1 text-sub-text">
        Open the section in the list to edit its texts one by one.
      </span>
    </PanelCard>
  );
}

/** A part's panel (Shopify's block panel): its words to edit (shown on the page as you type, saved
 * as typing on the page is; the field takes the card's room), or a video's address, and Ask
 * Buddy to edit. */
function PartDetails({
  part,
  section,
  paragraph,
  busy,
  onClose,
  onAsk,
  onType,
}: {
  part: MapPart;
  section: DeskSection;
  paragraph: DeskParagraph | null;
  busy: string | null;
  onClose: () => void;
  onAsk: () => void;
  onType: (line: number, text: string, done: boolean, original: string) => void;
}) {
  const fieldId = `part-${partId(part)}`;
  const locked = Boolean(
    paragraph && (paragraph.locked || paragraph.locked_parts.length > 0),
  );
  // The field follows the line while you aren't typing (B5.1, D125); typing, it keeps your words
  // and saves them against the words it started from, so a change made meanwhile (Buddy, undo, a
  // teammate) is refused as "changed elsewhere" instead of being overwritten. Once your words are
  // the line's, it follows the line again.
  const current = paragraph?.text ?? "";
  const [value, setValue] = useState(current);
  const [base, setBase] = useState(current);
  const [typing, setTyping] = useState(false);
  if (typing && current === value) {
    setTyping(false);
    setBase(current);
  } else if (!typing && current !== base) {
    setBase(current);
    setValue(current);
  }
  return (
    <PanelCard
      icon={
        <PartKindIcon
          part={part}
          className="size-3.5 shrink-0 text-icon-system"
        />
      }
      title={part.name}
      meta={section.label}
      onClose={onClose}
      onAsk={onAsk}
      askDisabled={Boolean(busy)}
    >
      {part.kind === "text" && paragraph ? (
        <>
          <label htmlFor={fieldId} className="sr-only">
            {part.name}
          </label>
          <Textarea
            id={fieldId}
            value={value}
            disabled={locked || Boolean(busy)}
            className="max-h-96 min-h-24"
            onChange={(event) => {
              setValue(event.target.value);
              setTyping(true);
              if (part.line != null)
                onType(part.line, event.target.value, false, base);
            }}
            onBlur={(event) => {
              if (part.line != null && typing)
                onType(part.line, event.target.value, true, base);
            }}
          />
          <span className="text-type-caption-1 text-sub-text">
            {locked
              ? "Parts of this line are filled from data (a price, the product name). Type the rest on the page."
              : busy
                ? busy
                : "Or click it twice on the page to type there."}
          </span>
        </>
      ) : null}
      {part.kind === "media" ? (
        <>
          <span className="text-type-caption-1 font-medium">Address</span>
          <span className="text-type-caption-1 break-all text-sub-text">
            {part.excerpt || "No address"}
          </span>
        </>
      ) : null}
    </PanelCard>
  );
}
