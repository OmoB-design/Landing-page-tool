"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";

import { ShortcutButton } from "@/components/app/shortcut-button";
import { Button } from "@/components/ui/button";
import { SectionsCloseIcon, SectionsOpenIcon } from "@/components/ui/icons";
import {
  BackArrowFigmaIcon,
  RedoFigmaIcon,
  UndoFigmaIcon,
} from "@/components/ui/lp-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { DESKTOP_WIDTH, type Viewport, ViewportSwitch } from "./page-canvas";

/**
 * The page editor's top bar (B3.1b, D105; as the template editor's): back to the review desk, the
 * page's name and its save status on the left; Sections (opens the section list), Desktop / Phone,
 * the zoom when the page is zoomed out to fit (Desktop keeps a 1280 px layout), then Undo and Redo
 * on the right. The save status crossfades between "Saving…", "Updating the
 * page…" (the canvas loading the newer page behind the one shown) and "Saved · version N", and the
 * hint says the page can be typed in (or that it waits while Lander rewrites).
 */
export function EditorTopBar({
  build,
  saving,
  updating,
  zoom,
  version,
  rewriting,
  sectionsOpen,
  onToggleSections,
  viewport,
  onViewport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  build: { id: string; key: string; title: string };
  saving: boolean;
  updating: boolean;
  /** How far the page is zoomed out to fit (1 when it isn't). */
  zoom: number;
  version: number;
  rewriting: boolean;
  sectionsOpen: boolean;
  onToggleSections: () => void;
  viewport: Viewport;
  onViewport: (viewport: Viewport) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const SectionsIcon = sectionsOpen ? SectionsCloseIcon : SectionsOpenIcon;
  const status = saving ? "saving" : updating ? "updating" : "saved";
  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 bg-surface-primary px-3 divider-b-half sm:px-4">
      <Button variant="ghost" size="icon-sm" asChild>
        <Link href={`/pages/${build.id}`} aria-label="Back to the review desk">
          <BackArrowFigmaIcon aria-hidden className="text-icon-nav-active" />
        </Link>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <h1
            tabIndex={0}
            className="max-w-48 min-w-0 truncate rounded-xsm text-type-body-small font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring xl:max-w-64"
          >
            {build.key} · {build.title}
          </h1>
        </TooltipTrigger>
        <TooltipContent>
          {build.key} · {build.title}
        </TooltipContent>
      </Tooltip>
      <p
        role="status"
        className="hidden shrink-0 items-center gap-1.5 text-type-caption-1 text-highlight-yellow-500 sm:flex"
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full bg-highlight-yellow-500 transition-opacity duration-300",
            status !== "saved" &&
              "animate-live-pulse motion-reduce:animate-none",
          )}
        />
        <span className="relative inline-grid">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={status}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {status === "saving"
                ? "Saving…"
                : status === "updating"
                  ? "Updating the page…"
                  : `Saved · version ${version}`}
            </motion.span>
          </AnimatePresence>
        </span>
      </p>
      <p className="hidden min-w-0 truncate text-type-caption-1 text-sub-text 2xl:block">
        {rewriting
          ? "Lander is rewriting: typing waits"
          : "Click any line to type in it"}
      </p>
      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={sectionsOpen}
              onClick={onToggleSections}
              className="gap-1.5 text-sub-text aria-pressed:bg-foreground-02 aria-pressed:text-body"
            >
              <SectionsIcon aria-hidden className="size-4 text-icon-system" />
              <span className="sr-only lg:not-sr-only">Sections</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {sectionsOpen ? "Hide sections" : "Show sections"}
          </TooltipContent>
        </Tooltip>
        <ViewportSwitch value={viewport} onChange={onViewport} />
        {zoom < 0.995 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="rounded-sm px-1 text-type-caption-1 text-sub-text tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {Math.round(zoom * 100)}%
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {viewport === "phone"
                ? "Zoomed out so the phone page fits"
                : `Zoomed out so the page keeps its ${DESKTOP_WIDTH} px desktop layout`}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <span aria-hidden className="mx-0.5 h-5 w-px bg-stroke" />
        <ShortcutButton
          label="Undo"
          shortcut="⌘Z"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <UndoFigmaIcon aria-hidden className="size-3.5 text-icon-system" />
        </ShortcutButton>
        <ShortcutButton
          label="Redo"
          shortcut="⇧⌘Z"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <RedoFigmaIcon aria-hidden className="size-4 text-icon-system" />
        </ShortcutButton>
      </div>
    </header>
  );
}
