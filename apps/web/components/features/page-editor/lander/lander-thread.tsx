"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { WorkingDots } from "@/components/app/working-dots";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/ui/shimmer-loader";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertIcon,
  BrushIcon,
  CheckIcon,
  ChevronRightIcon,
  DuplicateIcon,
  ImageIcon,
  MoveSectionIcon,
  RecolorIcon,
  RemoveIcon,
  RestoreIcon,
  RewriteIcon,
  SharpenIcon,
  ShortenIcon,
  StopIcon,
  WarmIcon,
} from "@/components/ui/icons";
import {
  type LanderSuggestion,
  type LanderTarget,
  plural,
  statusLabel,
} from "@/lib/pages/lander";
import type {
  AgentChange,
  AgentFeedback,
  AgentStep,
} from "@/lib/validators/agent";
import { cn } from "@/lib/utils";

import { useLanderMotion } from "../lander-motion";
import { ChangeCard, UndoControl, type UndoState } from "./change-card";
import { TargetChip } from "./composer-parts";
import { ReplyActions } from "./reply-actions";
import { LanderMark } from "./lander-mark";
import { RollingLabel } from "./rolling-label";
import { ChangeStack, UNPIN_EVENT, groupChanges } from "./change-stack";
import { StreamText, plainText } from "./stream-text";
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
  onKeepGoing,
  onRate,
  onImage,
  onRestore,
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
  /** Keep going: the newest request ran out of its budget; carry on in the same conversation. */
  onKeepGoing?: (view: TurnView) => void;
  /** Rates a reply (by its job), or takes the rating back (B3.1e). */
  onRate: (jobId: string, feedback: AgentFeedback | null) => void;
  /** Opens an image Lander changed in the image studio (B3.2a). */
  onImage?: (number: number) => void;
  /** Restore page to here: the page as it was when this request was sent. */
  onRestore?: (messageId: string) => void;
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
    // Opening or closing a stack of changes keeps it where it is (change-stack.tsx).
    const onUnpin = () => {
      pinned.current = false;
    };
    const observer = new ResizeObserver(() => {
      if (pinned.current) box.scrollTop = box.scrollHeight;
    });
    box.addEventListener("scroll", onScroll, { passive: true });
    box.addEventListener("wheel", onWheel, { passive: true });
    box.addEventListener("touchmove", onTouch, { passive: true });
    box.addEventListener("keydown", onKey);
    box.addEventListener(UNPIN_EVENT, onUnpin);
    observer.observe(inner);
    return () => {
      box.removeEventListener("scroll", onScroll);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("touchmove", onTouch);
      box.removeEventListener("keydown", onKey);
      box.removeEventListener(UNPIN_EVENT, onUnpin);
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
        // The composer's height, for the fade; and room under anything scrolled into view (a
        // feedback form), so it rests above the composer and the fade (measured, not styling).
        style={
          {
            "--lander-dock": `${dockHeight}px`,
            scrollPaddingBottom: dockHeight + FADE,
          } as CSSProperties
        }
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
              {views.map((view, i) => (
                <li key={view.turn.id} className="flex flex-col gap-3">
                  <UserBubble
                    request={view.turn.request}
                    target={view.turn.target}
                    images={view.turn.images}
                    onRestore={
                      onRestore &&
                      view.turn.messageId &&
                      view.turn.restorable &&
                      view.state !== "starting" &&
                      view.state !== "working"
                        ? () => onRestore(view.turn.messageId as string)
                        : undefined
                    }
                  />
                  <Reply
                    view={view}
                    undo={undoFor(view)}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    onShow={onShow}
                    onRefine={onRefine}
                    onImage={onImage}
                    onRetry={() => onRetry(view)}
                    onKeepGoing={
                      onKeepGoing && view.more && i === views.length - 1
                        ? () => onKeepGoing(view)
                        : undefined
                    }
                    onRate={(feedback) =>
                      view.turn.jobId && onRate(view.turn.jobId, feedback)
                    }
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
        {/* His face roams toward the pointer anywhere in the chat panel (B3.1j). */}
        <LanderMark size="lg" roam />
        <h2 className="text-type-h5 font-medium tracking-tight text-heading-01">
          What should we change?
        </h2>
        <p className="max-w-64 text-type-caption-1 text-sub-text">
          Ask Buddy to rewrite lines, move sections, restyle a box or recolour
          the page. Every request can be undone.
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
  images,
  onRestore,
}: {
  request: string;
  target: LanderTarget;
  images: string[];
  /** Restore page to here, when the page as it was then is still kept. */
  onRestore?: () => void;
}) {
  const { arrive, reduced } = useLanderMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={arrive}
      className="group/request flex flex-col items-end gap-1"
    >
      {images.length ? (
        <ul aria-label="Pictures sent" className="flex justify-end gap-1.5">
          {images.map((url, i) => (
            <li key={`${i}-${url.slice(-32)}`}>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block size-16 overflow-hidden rounded-md ring-thin ring-stroke outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link or a local picture */}
                <img
                  src={url}
                  alt={`Picture ${i + 1}`}
                  className="size-full object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative max-w-4/5">
        <div className="flex flex-col items-start gap-1.5 rounded-item bg-foreground-02 p-2">
          {/* What it was about, inside the request at the top (owner, 2026-11-06). */}
          <TargetChip target={target} />
          <p className="text-type-body-small whitespace-pre-line text-heading-01">
            {request ||
              `Give ${target ? target.label : "the page"} fresh words`}
          </p>
        </div>
        {onRestore ? (
          // A round button on the bubble's top-right corner, as Antigravity's agent chat has it;
          // quiet until the request is hovered or focused.
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Restore page to here"
                onClick={onRestore}
                // Dissolves in as the request is hovered (owner, 2026-11-05: as Claude's chat):
                // fading up to 75 % while it settles from 92 % and unblurs, on the strong ease;
                // solid when pointed at or focused. Reduced motion: the fade only.
                className="absolute -top-2 -right-2 flex size-6 scale-90 items-center justify-center rounded-full bg-surface-primary text-icon-system opacity-0 shadow-light ring-thin ring-stroke blur-xs transition duration-200 ease-out outline-none group-hover/request:scale-100 group-hover/request:opacity-75 group-hover/request:blur-none hover:text-body hover:opacity-100! focus-visible:scale-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:blur-none motion-reduce:scale-100 motion-reduce:blur-none"
              >
                <RestoreIcon aria-hidden className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Restore page to here</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </motion.div>
  );
}

/**
 * How many of `count` things to show (owner, 2026-11-05): when several arrive together they're
 * shown one at a time, `stepMs` apart, so a request reads as steps rather than a jump; a reply
 * loaded from the conversation (`enabled` false) shows at once.
 */
function useCatchUp(count: number, stepMs: number, enabled: boolean): number {
  const [shown, setShown] = useState(enabled ? 0 : count);
  useEffect(() => {
    if (!enabled || shown >= count) return;
    const id = window.setTimeout(
      () => setShown((n) => n + 1),
      shown === 0 ? 0 : stepMs,
    );
    return () => window.clearTimeout(id);
  }, [enabled, shown, count, stepMs]);
  return enabled ? Math.min(shown, count) : count;
}

function Reply({
  view,
  undo,
  onUndo,
  onRedo,
  onShow,
  onRefine,
  onRetry,
  onKeepGoing,
  onRate,
  onImage,
}: {
  view: TurnView;
  undo: UndoState;
  onUndo: () => void;
  onRedo: () => void;
  onShow: (lines: number[], section: string | null) => void;
  onRefine: (target: LanderTarget, request: string) => void;
  onImage?: (number: number) => void;
  onRetry: () => void;
  /** Shown on the newest reply that ran out of budget (B3.1f). */
  onKeepGoing?: () => void;
  onRate: (feedback: AgentFeedback | null) => void;
}) {
  const { reduced } = useLanderMotion();
  const { state, steps, turn, changes } = view;
  const live = state === "starting" || state === "working";
  const seconds = useSeconds(turn.startedAt, live);
  const [unfolded, setUnfolded] = useState<boolean | null>(null);
  // The steps show while it works and fold away once it's done (the status line unfolds them).
  const showSteps = unfolded ?? live;
  // A request made in this visit reveals its steps, then its change cards, then its closing
  // line, in order; one loaded from the conversation shows at once.
  const animated = turn.saved === null && !reduced;
  const stepsShown = useCatchUp(steps.length, 120, animated);
  const visibleSteps = steps.slice(0, stepsShown);
  const cardsDue = Math.min(
    changes.length,
    stepsShown >= steps.length
      ? changes.length
      : visibleSteps.filter((s) => s.change).length,
  );
  const cardsShown = useCatchUp(cardsDue, 140, animated);
  const caughtUp = stepsShown >= steps.length && cardsShown >= changes.length;
  const label = statusLabel(
    state,
    steps,
    seconds,
    view.queued,
    view.took,
    view.doing,
  );
  const finished = state === "done" || state === "stopped";

  return (
    <div className="group/reply flex flex-col gap-2">
      <button
        type="button"
        disabled={live || steps.length === 0}
        onClick={() => setUnfolded(!showSteps)}
        aria-expanded={live ? undefined : showSteps}
        className="group flex h-5 items-center gap-1.5 self-start rounded-xsm text-type-caption-1 text-sub-text outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:text-heading-02"
      >
        <span className="flex size-3.5 items-center justify-center">
          {live ? (
            <WorkingDots />
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
        {showSteps && steps.length > 0 ? (
          <motion.div
            key="steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: reduced ? 0.15 : 0.3,
              ease: [0.23, 1, 0.32, 1],
            }}
            className="overflow-hidden"
          >
            <ol
              aria-label="Steps"
              className="flex flex-col rounded-item px-2.5 py-1.5 ring-thin ring-stroke ring-inset"
            >
              {visibleSteps.map((step, i) => (
                <StepRow
                  key={`${i}-${step.label}`}
                  step={step}
                  first={i === 0}
                  last={i === visibleSteps.length - 1 && !live}
                />
              ))}
              {live ? (
                // The running row stays at the foot: rows above it open by height, so it moves
                // down with them rather than under them, and its words crossfade.
                <li
                  key="doing"
                  className="relative flex items-start gap-2.5 py-1"
                >
                  <Connector part="above" />
                  {/* The running step keeps a spinner (owner, 2026-11-05); the status line above
                      has the dotmatrix loader. */}
                  <span className="relative flex h-5 w-3 shrink-0 items-center justify-center bg-surface-primary text-heading-06">
                    <Spinner className="size-3" label="Working" />
                  </span>
                  <ShimmerText className="min-w-0 text-type-caption-1 leading-5 text-sub-text">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={view.doing?.text ?? "waiting"}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.18 }}
                        className="inline-block"
                      >
                        {view.doing?.text ??
                          (steps.length > 1
                            ? "Working on the next step…"
                            : "Thinking…")}
                      </motion.span>
                    </AnimatePresence>
                  </ShimmerText>
                </li>
              ) : null}
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {groupChanges(changes.slice(0, cardsShown).map((c) => c.kind)).map(
        (group) => {
          const card = (i: number) => {
            const change = changes[i];
            return change ? (
              <Change
                key={`${i}-${change.label}`}
                change={change}
                onShow={onShow}
                onRefine={onRefine}
                onImage={onImage}
              />
            ) : null;
          };
          return group.kind === "single" ? (
            card(group.index)
          ) : (
            // Many one-line cards in a row stack, with their count (owner, 2026-11-05).
            <ChangeStack
              key={`stack-${group.indices[0]}`}
              cards={group.indices.map((i) => ({
                key: `${i}-${changes[i]?.label}`,
                node: card(i),
              }))}
            />
          );
        },
      )}

      {finished && caughtUp && changes.length > 0 ? (
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

      {finished && caughtUp && view.closing ? (
        <StreamText
          text={view.closing}
          delay={0.25}
          className="text-type-body-small text-heading-01"
        />
      ) : null}

      {finished && caughtUp && onKeepGoing ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onKeepGoing}
          className="h-7 self-start px-2.5 text-type-caption-1"
        >
          Keep going
        </Button>
      ) : null}

      {finished && caughtUp && view.turn.jobId ? (
        <ReplyActions
          text={plainText(
            [view.plan, ...view.changes.map((c) => c.label), view.closing]
              .filter(Boolean)
              .join("\n\n"),
          )}
          feedback={view.feedback}
          onRate={onRate}
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

/**
 * The thin line joining the steps' dots (the reference video's): a row draws it from its top to its
 * dot ("above") and from its dot to its foot ("below"), so rows of any height join up. A picture
 * step's dot sits lower, level with its label in the frame.
 */
function Connector({
  part,
  low = false,
}: {
  part: "above" | "below";
  low?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-1.5 w-px -translate-x-1/2 bg-stroke",
        part === "above"
          ? cn("top-0", low ? "h-6" : "h-3.5")
          : cn("bottom-0", low ? "top-6" : "top-3.5"),
      )}
    />
  );
}

/**
 * One step Lander took: a dot on the line (red when it couldn't), its label and what it touched
 * under it. A step with a picture (what Lander looked at) is drawn as the overview's reminders: the
 * label in a Surface-Primary chip with a thin stroke on a Dashboard-grey card with a thin stroke and
 * a light shadow, the
 * picture under it (owner, 2026-11-05).
 */
function StepRow({
  step,
  first,
  last,
}: {
  step: AgentStep;
  first: boolean;
  last: boolean;
}) {
  const { arrive, reduced } = useLanderMotion();
  const picture = Boolean(step.image_url);
  return (
    <motion.li
      initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
      transition={{ ...arrive, duration: 0.24 }}
      className="relative flex items-start gap-2.5 overflow-hidden py-1"
    >
      {first ? null : <Connector part="above" low={picture} />}
      {last ? null : <Connector part="below" low={picture} />}
      <span
        className={cn(
          "relative flex h-5 w-3 shrink-0 items-center justify-center",
          picture && "mt-2.5",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full ring-2 ring-surface-primary",
            step.ok ? "bg-heading-06" : "bg-text-danger",
          )}
        />
        <span className="sr-only">{step.ok ? "Done" : "Couldn’t"}</span>
      </span>
      {picture && step.image_url ? (
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md bg-dashboard p-1.5 shadow-light ring-thin ring-stroke">
          <span className="rounded-sm bg-surface-primary px-1.5 py-1 text-type-caption-1 leading-5 font-medium text-heading-02 ring-thin ring-stroke">
            {step.label}
          </span>
          <a
            href={step.image_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open what Buddy saw: ${step.label}`}
            className="block overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
            <img
              src={step.image_url}
              alt=""
              className="max-h-40 w-full object-cover object-top"
            />
          </a>
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "text-type-caption-1 leading-5",
              step.ok ? "text-heading-05" : "text-sub-text",
            )}
          >
            {step.label}
          </span>
          {step.detail ? (
            <span className="truncate text-type-caption-2 text-heading-06">
              {step.detail}
            </span>
          ) : null}
        </span>
      )}
    </motion.li>
  );
}

const SECTION_ICONS = {
  move: MoveSectionIcon,
  duplicate: DuplicateIcon,
  remove: RemoveIcon,
} as const;

/** One change in the thread: a card of lines before and after, or a one-line section, colour,
 * style or image change (an image's shows the new picture, which opens it in the studio). */
function Change({
  change,
  onShow,
  onRefine,
  onImage,
}: {
  change: AgentChange;
  onShow: (lines: number[], section: string | null) => void;
  onRefine: (target: LanderTarget, request: string) => void;
  onImage?: (number: number) => void;
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
    change.kind === "colors"
      ? RecolorIcon
      : change.kind === "style"
        ? BrushIcon
        : change.kind === "image"
          ? ImageIcon
          : SECTION_ICONS[change.action];
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
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-type-caption-1 font-medium text-heading-02">
          {change.label}
        </span>
        {change.kind === "style" ? (
          <span className="truncate text-type-caption-2 text-heading-06">
            {Object.entries(change.styles)
              .map(([prop, value]) => `${prop} ${value}`)
              .join(" · ")}
          </span>
        ) : null}
        {change.kind === "image" && change.detail ? (
          <span className="truncate text-type-caption-2 text-heading-06">
            {change.detail}
          </span>
        ) : null}
      </span>
      {change.kind === "image" ? (
        <button
          type="button"
          aria-label={`Open image ${change.number}`}
          disabled={!onImage}
          onClick={() => onImage?.(change.number)}
          className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-foreground-02 ring-thin ring-stroke outline-none ring-inset hover:ring-stroke-input-active focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the picture Lander put on the page */}
          <img src={change.src} alt="" className="size-full object-cover" />
        </button>
      ) : null}
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
