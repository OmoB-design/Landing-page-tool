"use client";

import Link from "next/link";

import { HistoryButtons } from "@/components/app/history-buttons";
import { TruncatedTitle } from "@/components/app/truncated-title";
import { Button } from "@/components/ui/button";
import { MorphText } from "@/components/ui/text-morph";
import { ViewportSwitch } from "@/components/app/viewport-switch";
import {
  ExitIcon,
  PageFileIcon,
  SectionsNavIcon,
} from "@/components/ui/lp-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { DESKTOP_WIDTH, type Viewport } from "./page-canvas";

/**
 * The page editor's top bar (B3.1b, D105; laid out as Shopify's theme editor, owner 2026-11-06):
 * on the left the way back to the review desk (the owner's exit icon) and Sections (opens the
 * section list), with the typing hint on wide screens; in the middle the page icon, the page's
 * name (cut short, the whole name in a tooltip), a divider and the save status; on the right
 * Desktop / Phone, the zoom when the page is zoomed out to fit (Desktop keeps a 1280 px layout),
 * then Undo and Redo (Shopify's pill, icons only). The two sides share the width equally so the
 * middle stays centred. The save status morphs (torph) between "Saving…", "Updating the page…"
 * (the canvas loading the newer page behind the one shown) and "Saved" (no version number since
 * B3.1j: it counted every save and meant nothing; going back is Undo, or History on the review
 * desk).
 */
export function EditorTopBar({
  build,
  saving,
  updating,
  zoom,
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
  const status = saving ? "saving" : updating ? "updating" : "saved";
  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 bg-surface-primary px-3 divider-b-half sm:px-4">
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link
                href={`/pages/${build.id}`}
                aria-label="Back to the review desk"
              >
                <ExitIcon aria-hidden className="text-icon-nav-active" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to the review desk</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={sectionsOpen}
              onClick={onToggleSections}
              className="gap-1.5 text-sub-text aria-pressed:bg-foreground-02 aria-pressed:text-body"
            >
              <SectionsNavIcon aria-hidden className="text-icon-system" />
              <span className="sr-only lg:not-sr-only">Sections</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {sectionsOpen ? "Hide sections" : "Show sections"}
          </TooltipContent>
        </Tooltip>
        <p className="hidden min-w-0 truncate pl-1.5 text-type-caption-1 text-sub-text 2xl:block">
          {rewriting
            ? "Buddy is rewriting: typing waits"
            : "Click any line to type in it"}
        </p>
      </div>
      <div className="flex min-w-0 shrink items-center gap-2">
        <PageFileIcon aria-hidden className="shrink-0 text-icon-nav-active" />
        <TruncatedTitle className="max-w-40 text-type-body-small font-medium xl:max-w-48">
          {build.title}
        </TruncatedTitle>
        <span aria-hidden className="hidden header-divider sm:block" />
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
                  : "Saved"}
            </MorphText>
          </span>
        </p>
      </div>
      <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-1.5">
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
        <HistoryButtons
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      </div>
    </header>
  );
}
