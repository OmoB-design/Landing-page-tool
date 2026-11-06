"use client";

import Link from "next/link";

import { ShortcutButton } from "@/components/app/shortcut-button";
import { TruncatedTitle } from "@/components/app/truncated-title";
import { Button } from "@/components/ui/button";
import { MorphText } from "@/components/ui/text-morph";
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
 * on the right. The save status morphs (torph) between "Saving…", "Updating the page…" (the canvas
 * loading the newer page behind the one shown) and "Saved · version N", its number rolling; the
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
      <TruncatedTitle className="text-type-body-small font-medium">
        {`${build.key} · ${build.title}`}
      </TruncatedTitle>
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
          <MorphText className="whitespace-nowrap">
            {status === "saving"
              ? "Saving…"
              : status === "updating"
                ? "Updating the page…"
                : `Saved · version ${version}`}
          </MorphText>
        </span>
      </p>
      <p className="hidden min-w-0 truncate text-type-caption-1 text-sub-text 2xl:block">
        {rewriting
          ? "Buddy is rewriting: typing waits"
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
                <MorphText>{`${Math.round(zoom * 100)}%`}</MorphText>
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
