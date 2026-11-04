"use client";

import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ChevronDownIcon,
  PagesIcon,
  RenameIcon,
  SendIcon,
} from "@/components/ui/icons";
import { LocateFigmaIcon } from "@/components/ui/lp-icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { REQUEST_MAX } from "@/lib/pages/lander";
import { cn } from "@/lib/utils";

import { useLanderMotion } from "../lander-motion";

const SHOWN = 4;

export type UndoState = "can-undo" | "undone" | "later" | "none";

/**
 * A change Lander made, as a card in the thread (the reference video's invoice card): the target
 * and how many lines, Show on page and fold in the header; while it works, skeleton rows where the
 * lines will land; then each line, the old words struck through above the new ones, arriving one
 * after another. The foot has **Ask Lander to edit** (a small field for this card: a follow-up on
 * the same section) and Undo, or Redo once undone; a change with later changes after it says to use
 * the top bar's Undo.
 */
export function ChangeCard({
  title,
  lines,
  pending,
  skeletonRows,
  undo,
  onUndo,
  onRedo,
  onShow,
  onRefine,
}: {
  title: string;
  lines: { number: number; before: string; after: string }[];
  /** The lines are still being written: skeleton rows stand in for them. */
  pending: boolean;
  skeletonRows: number;
  undo: UndoState;
  onUndo: () => void;
  onRedo: () => void;
  onShow: () => void;
  onRefine: (request: string) => void;
}) {
  const { arrive, reduced } = useLanderMotion();
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  const [refining, setRefining] = useState(false);
  const [note, setNote] = useState("");
  const shown = all ? lines : lines.slice(0, SHOWN);
  const count = pending ? null : lines.length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    onRefine(note.trim());
    setNote("");
    setRefining(false);
  };

  return (
    <motion.section
      aria-label={`Change: ${title}`}
      initial={{
        opacity: 0,
        y: reduced ? 0 : 6,
        filter: reduced ? "none" : "blur(4px)",
      }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={arrive}
      className={cn(
        "overflow-hidden rounded-item bg-surface-primary shadow-light ring-thin ring-stroke",
        undo === "undone" && "opacity-70",
      )}
    >
      <header className="flex h-9 items-center gap-2 bg-foreground-01 pr-1 pl-3">
        <PagesIcon aria-hidden className="size-3.5 shrink-0 text-icon-system" />
        <p className="flex min-w-0 flex-1 items-baseline gap-1 text-type-caption-1">
          <span className="min-w-0 truncate font-medium text-heading-02">
            {title}
          </span>
          {count !== null ? (
            <span className="shrink-0 text-sub-text">
              · {count} {count === 1 ? "line" : "lines"}
              {undo === "undone" ? " · undone" : ""}
            </span>
          ) : null}
        </p>
        <CardButton label="Show on page" onClick={onShow}>
          <LocateFigmaIcon aria-hidden className="size-3.5" />
        </CardButton>
        <CardButton
          label={open ? "Fold" : "Unfold"}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-3.5 transition-transform duration-200 ease-out",
              !open && "-rotate-90",
            )}
          />
        </CardButton>
      </header>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: reduced ? 0.15 : 0.28,
              ease: [0.2, 0.8, 0, 1],
            }}
            className="overflow-hidden"
          >
            <ol className="flex flex-col px-3">
              {pending
                ? Array.from({ length: skeletonRows }, (_, i) => (
                    <li
                      key={`s${i}`}
                      className="flex flex-col gap-1.5 py-2.5 divider-b-half last:shadow-none"
                    >
                      <Skeleton
                        width="55%"
                        height={8}
                        radius="var(--radius-xxs)"
                      />
                      <Skeleton
                        width={i % 2 ? "70%" : "88%"}
                        height={10}
                        radius="var(--radius-xxs)"
                      />
                    </li>
                  ))
                : shown.map((line, i) => (
                    <motion.li
                      key={line.number}
                      initial={{
                        opacity: 0,
                        filter: reduced ? "none" : "blur(4px)",
                      }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      transition={{ ...arrive, delay: reduced ? 0 : 0.06 * i }}
                      className="flex flex-col gap-0.5 py-2.5 divider-b-half last:shadow-none"
                    >
                      <span className="text-type-caption-1 text-heading-06 line-through decoration-caption-1">
                        {line.before}
                      </span>
                      <span className="text-type-body-small text-heading-01">
                        {line.after}
                      </span>
                    </motion.li>
                  ))}
            </ol>
            {!pending && lines.length > SHOWN ? (
              <button
                type="button"
                onClick={() => setAll((a) => !a)}
                className="mx-3 mb-2 rounded-xsm text-type-caption-1 font-medium text-sub-text outline-none hover:text-body focus-visible:ring-2 focus-visible:ring-ring"
              >
                {all ? "Show fewer" : `Show all ${lines.length}`}
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!pending ? (
        <footer className="flex h-10 items-center gap-1 bg-foreground-01 px-1.5 divider-t-half">
          <AnimatePresence initial={false} mode="popLayout">
            {refining ? (
              <motion.form
                key="refine"
                onSubmit={submit}
                initial={{ opacity: 0, filter: "blur(2px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.18 }}
                className="flex min-w-0 flex-1 items-center gap-1.5 pl-1.5"
              >
                <RenameIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-icon-system"
                />
                <label className="sr-only" htmlFor={`refine-${title}`}>
                  What should change in {title}?
                </label>
                <input
                  id={`refine-${title}`}
                  autoFocus
                  value={note}
                  maxLength={REQUEST_MAX}
                  placeholder={`Ask Lander to edit ${title}`}
                  onChange={(event) => setNote(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setNote("");
                      setRefining(false);
                    }
                  }}
                  onBlur={() => !note.trim() && setRefining(false)}
                  className="min-w-0 flex-1 bg-transparent text-type-caption-1 text-heading-01 outline-none placeholder:text-caption-1"
                />
                <button
                  type="submit"
                  aria-label={`Send the edit for ${title}`}
                  disabled={!note.trim()}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-heading-01 text-surface-primary transition-colors duration-150 outline-none hover:bg-heading-02 focus-visible:ring-2 focus-visible:ring-ring disabled:bg-foreground-03 disabled:text-heading-06"
                >
                  <SendIcon aria-hidden className="size-3.5" />
                </button>
              </motion.form>
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0, filter: "blur(2px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.18 }}
                className="flex min-w-0 flex-1 items-center justify-between gap-1"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRefining(true)}
                  disabled={undo === "undone"}
                  className="h-7 gap-1.5 px-1.5 text-type-caption-1 text-heading-02 hover:bg-foreground-03"
                >
                  <RenameIcon
                    aria-hidden
                    className="size-3.5 text-icon-system"
                  />
                  Ask Lander to edit
                </Button>
                <UndoControl undo={undo} onUndo={onUndo} onRedo={onRedo} />
              </motion.div>
            )}
          </AnimatePresence>
        </footer>
      ) : null}
    </motion.section>
  );
}

function UndoControl({
  undo,
  onUndo,
  onRedo,
}: {
  undo: UndoState;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const quiet =
    "h-7 px-2 text-type-caption-1 text-heading-02 hover:bg-foreground-03";
  if (undo === "can-undo")
    return (
      <Button variant="ghost" size="sm" onClick={onUndo} className={quiet}>
        Undo
      </Button>
    );
  if (undo === "undone")
    return (
      <Button variant="ghost" size="sm" onClick={onRedo} className={quiet}>
        Redo
      </Button>
    );
  if (undo === "later")
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-disabled
            className={cn(quiet, "cursor-not-allowed opacity-50")}
          >
            Undo
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Later changes came after this one. Use Undo in the top bar.
        </TooltipContent>
      </Tooltip>
    );
  return null;
}

function CardButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-icon-system transition-colors duration-150 outline-none hover:bg-foreground-03 hover:text-body focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
