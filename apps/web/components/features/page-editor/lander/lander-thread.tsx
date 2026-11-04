"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  AlertIcon,
  CheckIcon,
  ChevronRightIcon,
  DuplicateIcon,
  MoveSectionIcon,
  RecolorIcon,
  RemoveIcon,
  RewriteIcon,
  SharpenIcon,
  ShortenIcon,
  StepFailedIcon,
  StopIcon,
  WarmIcon,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import {
  type LanderSuggestion,
  type LanderTarget,
  plural,
  statusLabel,
} from "@/lib/pages/lander";
import type { AgentChange } from "@/lib/validators/agent";
import { cn } from "@/lib/utils";

import { useLanderMotion } from "../lander-motion";
import { ChangeCard, UndoControl, type UndoState } from "./change-card";
import { LanderMark } from "./lander-mark";
import { RollingLabel } from "./rolling-label";
import { StreamText } from "./stream-text";
import type { TurnView } from "./use-lander";

const SUGGESTION_ICONS = {
  shorten: ShortenIcon,
  sharpen: SharpenIcon,
  warm: WarmIcon,
  page: RewriteIcon,
} as const;

/** How near the bottom (px) still counts as following the conversation. */
const FOLLOW_SLACK = 64;
/** The fade above the composer, in px (matches `--lander-fade` in globals.css). */
const FADE = 24;

/**
 * Lander's thread (B3.1b, D105). Empty, the mark over "What should we change?" and starting points
 * drawn from the page. Otherwise each request as a grey bubble on the right, and Lander's reply on
 * the panel: a status line (thinking with seconds, then what it's doing, rolling, then "Completed 3
 * steps", which unfolds them), the plan sentence arriving word by word, the steps as a thin
 * timeline that tick as they finish and fold away once done, the change card, and the closing line.
 * It keeps to the bottom as things arrive unless you've scrolled up to read, and a new request
 * always brings you down to it. The composer floats
 * over its foot, and the messages fade out over a short stretch just above it, so they read as
 * sliding in behind it (Stageshow's edge fade; owner, 2026-11-04).
 */
export function LanderThread({
  views,
  suggestions,
  undoFor,
  onSuggestion,
  onUndo,
  onRedo,
  onShow,
  onRefine,
  onRetry,
  composer,
}: {
  views: TurnView[];
  suggestions: LanderSuggestion[];
  undoFor: (view: TurnView) => UndoState;
  onSuggestion: (suggestion: LanderSuggestion) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Show on page: flashes these lines (a change card's) and selects their section. */
  onShow: (lines: number[], section: string | null) => void;
  onRefine: (target: LanderTarget, request: string) => void;
  onRetry: (view: TurnView) => void;
  /** The composer, floating over the thread's foot. */
  composer: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // The composer's height: the thread scrolls on under it, and its last line rests just above the
  // fade.
  const dock = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  useEffect(() => {
    const element = dock.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setDockHeight(Math.ceil(element.getBoundingClientRect().height)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Keep to the bottom while things arrive. Only the reader scrolling up (wheel, touch, keys) stops
  // it, and coming back near the bottom starts it again: the thread's own scrolling never does.
  useEffect(() => {
    const box = scroller.current;
    const inner = content.current;
    if (!box || !inner) return;
    const near = () =>
      box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_SLACK;
    const onScroll = () => {
      if (near()) pinned.current = true;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) pinned.current = false;
    };
    const onTouch = () =>
      window.requestAnimationFrame(() => {
        if (!near()) pinned.current = false;
      });
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(event.key))
        pinned.current = false;
    };
    const observer = new ResizeObserver(() => {
      if (pinned.current) box.scrollTop = box.scrollHeight;
    });
    box.addEventListener("scroll", onScroll, { passive: true });
    box.addEventListener("wheel", onWheel, { passive: true });
    box.addEventListener("touchmove", onTouch, { passive: true });
    box.addEventListener("keydown", onKey);
    observer.observe(inner);
    return () => {
      box.removeEventListener("scroll", onScroll);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("touchmove", onTouch);
      box.removeEventListener("keydown", onKey);
      observer.disconnect();
    };
  }, []);

  // A new request follows to the bottom wherever the reader was: smoothly as you send, at once
  // when the conversation loads.
  const { reduced } = useLanderMotion();
  const count = views.length;
  const shownCount = useRef(0);
  useEffect(() => {
    const box = scroller.current;
    const before = shownCount.current;
    shownCount.current = count;
    if (!box || count === 0 || count <= before) return;
    pinned.current = true;
    const smooth = before > 0 && !reduced;
    if (smooth && typeof box.scrollTo === "function")
      box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    else box.scrollTop = box.scrollHeight;
  }, [count, reduced]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        className="lander-thread-fade relative min-h-0 flex-1 overflow-y-auto"
        // The composer's height, for the fade (measured, not styling).
        style={{ "--lander-dock": `${dockHeight}px` } as CSSProperties}
      >
        <div
          ref={content}
          className="flex min-h-full flex-col px-4 pt-2"
          style={{ paddingBottom: dockHeight + FADE }}
        >
          {views.length === 0 ? (
            <Empty suggestions={suggestions} onSuggestion={onSuggestion} />
          ) : (
            <ol className="flex flex-col gap-6">
              {views.map((view) => (
                <li key={view.turn.id} className="flex flex-col gap-3">
                  <UserBubble
                    request={view.turn.request}
                    target={view.turn.target}
                  />
                  <Reply
                    view={view}
                    undo={undoFor(view)}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    onShow={onShow}
                    onRefine={onRefine}
                    onRetry={() => onRetry(view)}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <div ref={dock} className="absolute inset-x-0 bottom-0">
        {composer}
      </div>
    </div>
  );
}

function Empty({
  suggestions,
  onSuggestion,
}: {
  suggestions: LanderSuggestion[];
  onSuggestion: (suggestion: LanderSuggestion) => void;
}) {
  const { arrive, reduced } = useLanderMotion();
  return (
    <div className="my-auto flex flex-col items-center gap-6 py-8">
      <motion.div
        initial={{ opacity: 0, scale: reduced ? 1 : 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={arrive}
        className="flex flex-col items-center gap-3 text-center"
      >
        <LanderMark size="lg" />
        <h2 className="text-type-h5 font-medium tracking-tight text-heading-01">
          What should we change?
        </h2>
        <p className="max-w-64 text-type-caption-1 text-sub-text">
          Ask Lander to rewrite lines, move or copy sections, or recolour the
          page. Every request can be undone.
        </p>
      </motion.div>
      <div className="flex w-full flex-col gap-1">
        <p className="px-2 text-type-caption-1 text-heading-06">
          Or try a suggestion
        </p>
        <ul className="flex flex-col">
          {suggestions.map((s, i) => {
            const Icon = SUGGESTION_ICONS[s.icon];
            return (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: reduced ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...arrive, delay: reduced ? 0 : 0.08 + i * 0.05 }}
              >
                <button
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-type-body-small text-heading-02 transition-colors duration-150 outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon
                    aria-hidden
                    className="mt-0.75 size-3.5 shrink-0 text-icon-system"
                  />
                  <span className="line-clamp-2 min-w-0 flex-1">{s.text}</span>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function UserBubble({
  request,
  target,
}: {
  request: string;
  target: LanderTarget;
}) {
  const { arrive, reduced } = useLanderMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={arrive}
      className="flex flex-col items-end gap-1"
    >
      <p className="max-w-4/5 rounded-item bg-foreground-02 px-3 py-2 text-type-body-small text-heading-01">
        {request || `Give ${target ? target.label : "the page"} fresh words`}
      </p>
      <span className="pr-1 text-type-caption-2 text-heading-06">
        {target ? target.label : "Whole page"}
      </span>
    </motion.div>
  );
}

function Reply({
  view,
  undo,
  onUndo,
  onRedo,
  onShow,
  onRefine,
  onRetry,
}: {
  view: TurnView;
  undo: UndoState;
  onUndo: () => void;
  onRedo: () => void;
  onShow: (lines: number[], section: string | null) => void;
  onRefine: (target: LanderTarget, request: string) => void;
  onRetry: () => void;
}) {
  const { arrive, reduced } = useLanderMotion();
  const { state, steps, turn, changes } = view;
  const live = state === "starting" || state === "working";
  const seconds = useSeconds(turn.startedAt, live);
  const [unfolded, setUnfolded] = useState<boolean | null>(null);
  // The steps show while it works and fold away once it's done (the status line unfolds them).
  const showSteps = unfolded ?? live;
  const label = statusLabel(state, steps, seconds, view.queued, view.took);
  const finished = state === "done" || state === "stopped";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={live || steps.length === 0}
        onClick={() => setUnfolded(!showSteps)}
        aria-expanded={live ? undefined : showSteps}
        className="group flex h-5 items-center gap-1.5 self-start rounded-xsm text-type-caption-1 text-sub-text outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:text-heading-02"
      >
        <span className="flex size-3.5 items-center justify-center">
          {live ? (
            <Spinner className="size-3" label="Working" />
          ) : state === "stopped" ? (
            <StopIcon
              aria-hidden
              className="size-2.5 fill-current text-heading-06"
            />
          ) : finished ? (
            <CheckIcon aria-hidden className="size-3.5 text-heading-06" />
          ) : (
            <AlertIcon aria-hidden className="size-3.5 text-text-danger" />
          )}
        </span>
        <RollingLabel label={label} working={live} />
        {!live && steps.length > 0 ? (
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3 transition-transform duration-200 ease-out",
              showSteps && "rotate-90",
            )}
          />
        ) : null}
      </button>

      {view.plan ? (
        <StreamText
          text={view.plan}
          className="text-type-body-small text-heading-01"
        />
      ) : null}

      <AnimatePresence initial={false}>
        {showSteps && (steps.length > 0 || live) ? (
          <motion.ol
            key="steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: reduced ? 0.15 : 0.3,
              ease: [0.2, 0.8, 0, 1],
            }}
            className="flex flex-col overflow-hidden"
          >
            {steps.map((step, i) => (
              <motion.li
                key={`${i}-${step.label}`}
                initial={{
                  opacity: 0,
                  y: reduced ? 0 : 4,
                  filter: reduced ? "none" : "blur(3px)",
                }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={arrive}
                className="relative flex items-start gap-2 py-1 pl-0.5"
              >
                {i < steps.length - 1 || live ? (
                  <span
                    aria-hidden
                    className="absolute top-6 bottom-0 left-2 w-px bg-stroke"
                  />
                ) : null}
                <span className="flex size-4 shrink-0 items-center justify-center pt-0.5">
                  {step.ok ? (
                    <CheckIcon
                      aria-hidden
                      className="size-3.5 text-heading-06"
                    />
                  ) : (
                    <StepFailedIcon
                      aria-hidden
                      className="size-3.5 text-text-danger"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "text-type-caption-1 leading-5",
                    step.ok ? "text-heading-05" : "text-sub-text",
                  )}
                >
                  {step.label}
                </span>
              </motion.li>
            ))}
            {live ? (
              <motion.li
                key="thinking"
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-2 py-1 pl-0.5"
              >
                <span className="flex size-4 shrink-0 items-center justify-center pt-0.5">
                  <Spinner className="size-3" label="Working" />
                </span>
                <span className="text-type-caption-1 leading-5 text-sub-text">
                  {view.queued
                    ? "Waiting for a worker…"
                    : steps.length > 1
                      ? "Working on the next step…"
                      : "Thinking…"}
                </span>
              </motion.li>
            ) : null}
          </motion.ol>
        ) : null}
      </AnimatePresence>

      {changes.map((change, i) => (
        <Change
          key={`${i}-${change.label}`}
          change={change}
          onShow={onShow}
          onRefine={onRefine}
        />
      ))}

      {finished && changes.length > 0 ? (
        <div className="flex items-center justify-between gap-2 pl-0.5">
          <span className="text-type-caption-1 text-heading-06">
            {changes.length === 1
              ? "One change, one undo step"
              : `${plural(changes.length, "change")}, one undo step`}
            {undo === "undone" ? " · undone" : ""}
          </span>
          <UndoControl undo={undo} onUndo={onUndo} onRedo={onRedo} />
        </div>
      ) : null}

      {finished && view.closing ? (
        <StreamText
          text={view.closing}
          delay={0.25}
          className="text-type-body-small text-heading-01"
        />
      ) : null}

      {state === "failed" ? (
        <div className="flex items-center gap-2">
          <p className="text-type-caption-1 text-text-danger">{view.error}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="h-6 px-1.5 text-type-caption-1 text-heading-02 hover:bg-foreground-02"
          >
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const SECTION_ICONS = {
  move: MoveSectionIcon,
  duplicate: DuplicateIcon,
  remove: RemoveIcon,
} as const;

/** One change in the thread: a card of lines before and after, or a one-line section or colour
 * change. */
function Change({
  change,
  onShow,
  onRefine,
}: {
  change: AgentChange;
  onShow: (lines: number[], section: string | null) => void;
  onRefine: (target: LanderTarget, request: string) => void;
}) {
  const { arrive, reduced } = useLanderMotion();
  if (change.kind === "lines") {
    const target =
      change.section && change.section_label
        ? { key: change.section, label: change.section_label }
        : null;
    return (
      <ChangeCard
        title={change.section_label ?? "The page"}
        lines={change.lines}
        onShow={() =>
          onShow(
            change.lines.map((l) => l.number),
            change.section,
          )
        }
        onRefine={(request) => onRefine(target, request)}
      />
    );
  }
  const Icon =
    change.kind === "colors" ? RecolorIcon : SECTION_ICONS[change.action];
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: reduced ? 0 : 6,
        filter: reduced ? "none" : "blur(4px)",
      }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={arrive}
      className="flex min-h-9 items-center gap-2 rounded-item bg-surface-primary px-3 py-2 shadow-light ring-thin ring-stroke"
    >
      <Icon aria-hidden className="size-3.5 shrink-0 text-icon-system" />
      <span className="min-w-0 flex-1 truncate text-type-caption-1 font-medium text-heading-02">
        {change.label}
      </span>
      {change.kind === "colors" ? (
        <span
          className="flex shrink-0 items-center gap-1.5"
          aria-label="New colours"
        >
          {Object.values(change.after).map((colour) => (
            <span
              key={colour}
              aria-hidden
              className="size-3.5 rounded-full ring-thin ring-stroke"
              // A colour of the page's (data, not styling).
              style={{ backgroundColor: colour }}
            />
          ))}
        </span>
      ) : null}
    </motion.div>
  );
}

/** Whole seconds since `from`, ticking while `live`. */
function useSeconds(from: number, live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [live]);
  return Math.max(0, Math.floor((now - from) / 1000));
}
