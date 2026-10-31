"use client";

import Link from "next/link";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { Mover } from "@/components/app/mover";
import { PagesIcon } from "@/components/ui/icons";
import {
  BackArrowFigmaIcon,
  RedoFigmaIcon,
  UndoFigmaIcon,
} from "@/components/ui/lp-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type EditorActionResult,
  editTemplate,
  redoTemplate,
  restoreTemplate,
  startAnalysis,
  undoTemplate,
} from "@/lib/templates/actions";
import { addedKey, selectionAfterRemove } from "@/lib/templates/editor";
import type { AnalysisJob } from "@/lib/templates/queries";
import type {
  LayoutAction,
  TemplateEditorState,
} from "@/lib/validators/template";

import { AnalysisBar } from "./analysis-bar";
import { ContentPanel } from "./content-panel";
import { DetailsPanel } from "./details-panel";
import { EditorPreview } from "./editor-preview";
import { IssuesPanel } from "./issues-panel";
import { LookPanel } from "./look-panel";
import { RulesPanel } from "./rules-panel";

export type Tab = "content" | "look" | "rules" | "details" | "issues";

const PANEL_MIN = 360;
// The owner's chosen width (2026-10-31): the narrowest, giving the preview the room.
const PANEL_DEFAULT = 360;
const PANEL_MAX = 640;
const PREVIEW_MIN = 480;
const WIDTH_KEY = "lp-editor-panel-width";

const noSubscribe = () => () => {};
function readSavedWidth() {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved >= PANEL_MIN && saved <= PANEL_MAX ? saved : null;
  } catch {
    return null;
  }
}

/**
 * The section editor (BUILD_SPEC §8.3, laid out like the owner's reference): a full-screen top
 * bar (back, name, save status, undo/redo, Create a page), a left panel with Content, Look,
 * Details and Issues tabs, and the live preview on the right. Every change is saved by the
 * worker as a new version; the preview reloads with it. A clone (B2.2) adds the analysis strip
 * under the top bar and a Rules tab, and Create a page waits until its analysis is confirmed.
 */
export function TemplateEditor({
  initial,
  analysisJob = null,
  initialTab = "content",
}: {
  initial: TemplateEditorState;
  analysisJob?: AnalysisJob | null;
  /** The tab to open on (the dev states page opens Look or Rules). */
  initialTab?: Tab;
}) {
  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selected, setSelected] = useState<string | null>(
    initial.sections[0]?.key ?? null,
  );
  const [pending, startTransition] = useTransition();
  // A dragged order shows straight away and settles when the save returns.
  const [sections, showOrder] = useOptimistic(
    state.sections,
    (current, order: string[]) =>
      order
        .map((key) => current.find((s) => s.key === key))
        .filter((s) => s !== undefined),
  );
  const version = state.template.version;
  const templateId = state.template.id;

  const run = useCallback(
    (
      save: () => Promise<EditorActionResult>,
      after?: (next: TemplateEditorState) => void,
      optimistic?: () => void,
    ) => {
      startTransition(async () => {
        optimistic?.();
        const result = await save();
        if (result.state) {
          const next = result.state;
          setState(next);
          after?.(next);
          return;
        }
        if (result.conflict) {
          toast.error(result.error ?? "This template changed elsewhere.", {
            action: {
              label: "Reload",
              onClick: () => window.location.reload(),
            },
            duration: Infinity,
          });
        } else {
          toast.error(result.error ?? "Couldn't save the change.");
        }
      });
    },
    [],
  );

  const edit = useCallback(
    (action: LayoutAction) => {
      const before = state.sections.map((s) => s.key);
      run(
        () => editTemplate(templateId, version, action),
        (next) => {
          const keys = next.sections.map((s) => s.key);
          if (action.type === "remove")
            setSelected(selectionAfterRemove(before, action.key));
          else if (action.type === "duplicate")
            setSelected(addedKey(before, keys) ?? action.key);
        },
        action.type === "reorder" ? () => showOrder(action.keys) : undefined,
      );
    },
    [run, showOrder, state.sections, templateId, version],
  );

  const keepSelection = useCallback((next: TemplateEditorState) => {
    setSelected((key) =>
      key && next.sections.some((s) => s.key === key)
        ? key
        : (next.sections[0]?.key ?? null),
    );
  }, []);
  const undo = useCallback(() => {
    if (state.can_undo && !pending)
      run(() => undoTemplate(templateId, version), keepSelection);
  }, [keepSelection, pending, run, state.can_undo, templateId, version]);
  const redo = useCallback(() => {
    if (state.can_redo && !pending)
      run(() => redoTemplate(templateId, version), keepSelection);
  }, [keepSelection, pending, run, state.can_redo, templateId, version]);
  const restore = (target: number) =>
    run(() => restoreTemplate(templateId, version, target), keepSelection);

  // ⌘Z / Ctrl+Z undoes, with Shift (or Ctrl+Y) redoes, unless you're typing in a field.
  const shortcuts = useRef({ undo, redo });
  useEffect(() => {
    shortcuts.current = { undo, redo };
  }, [undo, redo]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) shortcuts.current.undo();
      else if ((key === "z" && event.shiftKey) || key === "y")
        shortcuts.current.redo();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A clone's analysis (B2.2): the job being followed, started from the strip or Details.
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(
    analysisJob?.status === "queued" || analysisJob?.status === "running"
      ? analysisJob.id
      : null,
  );
  const [earlierFailure, setEarlierFailure] = useState<string | null>(
    analysisJob?.status === "failed" ? analysisJob.error : null,
  );
  const [startingAnalysis, startAnalysisTransition] = useTransition();
  const analyse = () =>
    startAnalysisTransition(async () => {
      setEarlierFailure(null);
      const result = await startAnalysis(templateId);
      if (result.jobId) setAnalysisJobId(result.jobId);
      else toast.error(result.error ?? "Couldn’t start the analysis.");
    });
  const finishAnalysis = useCallback(() => setAnalysisJobId(null), []);
  const analysing = startingAnalysis || analysisJobId !== null;

  // The panel's width (Figma 722:14843: the Mover on its edge), remembered per browser. Read on the
  // client only; a drag or key press takes over from it.
  const savedWidth = useSyncExternalStore(
    noSubscribe,
    readSavedWidth,
    () => null,
  );
  const [chosenWidth, setChosenWidth] = useState<number | null>(null);
  const panelWidth = chosenWidth ?? savedWidth ?? PANEL_DEFAULT;
  const root = useRef<HTMLDivElement>(null);
  const panelMax = useCallback(
    () =>
      Math.min(
        PANEL_MAX,
        (root.current?.clientWidth ?? PANEL_MAX + PREVIEW_MIN) - PREVIEW_MIN,
      ),
    [],
  );
  const rememberWidth = useCallback((value: number) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(value));
    } catch {
      // Storage blocked: the width lasts for this visit.
    }
  }, []);

  const problems = state.issues.filter((i) => i.severity !== "info").length;
  const cloned = state.template.origin === "cloned";
  const showSection = (key: string) => {
    setSelected(key);
    setTab("content");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-topbar shrink-0 items-center gap-3 bg-surface-primary px-3 divider-b-half sm:px-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/templates?view=yours" aria-label="Back to templates">
            <BackArrowFigmaIcon aria-hidden className="text-icon-nav-active" />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate text-type-body-small font-medium">
          {state.template.name}
        </h1>
        <p
          role="status"
          className="hidden shrink-0 items-center gap-1.5 text-type-caption-1 text-highlight-yellow-500 sm:flex"
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-highlight-yellow-500"
          />
          {pending ? "Saving…" : `Saved · version ${version}`}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <ShortcutButton
            label="Undo"
            shortcut="⌘Z"
            disabled={!state.can_undo || pending}
            onClick={undo}
          >
            <UndoFigmaIcon aria-hidden className="size-3.5 text-icon-system" />
          </ShortcutButton>
          <ShortcutButton
            label="Redo"
            shortcut="⇧⌘Z"
            disabled={!state.can_redo || pending}
            onClick={redo}
          >
            <RedoFigmaIcon aria-hidden className="size-4 text-icon-system" />
          </ShortcutButton>
          {state.template.ready ? (
            <Button size="sm" className="ml-1" asChild>
              <Link href={`/pages/new?template=${templateId}`}>
                <PagesIcon aria-hidden />
                <span className="sr-only sm:not-sr-only">Create a page</span>
              </Link>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="ml-1 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  aria-disabled
                >
                  <PagesIcon aria-hidden />
                  <span className="sr-only sm:not-sr-only">Create a page</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Confirm the analysis first</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>
      <AnalysisBar
        state={state}
        jobId={analysisJobId}
        earlierFailure={earlierFailure}
        starting={startingAnalysis}
        onAnalyse={analyse}
        onFinished={finishAnalysis}
        onState={(next) => {
          setState(next);
          keepSelection(next);
        }}
      />
      <div ref={root} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          // The panel's width follows the Mover (data, not styling).
          style={{ "--panel-width": `${panelWidth}px` } as CSSProperties}
          className="relative h-1/2 shrink-0 border-b border-stroke bg-surface-primary lg:h-auto lg:w-(--panel-width) lg:border-b-0 lg:divider-r-thin"
        >
          <Mover
            value={panelWidth}
            min={PANEL_MIN}
            max={panelMax}
            defaultValue={PANEL_DEFAULT}
            side="left"
            label="Resize the editor panel"
            onChange={setChosenWidth}
            onCommit={rememberWidth}
            className="absolute top-1/2 -right-2 z-10 hidden -translate-y-1/2 lg:flex"
          />
          <TabsList
            aria-label="Editor panels"
            className="shrink-0 px-4 py-2.5 divider-b-thin"
          >
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="look">Look</TabsTrigger>
            {cloned ? <TabsTrigger value="rules">Rules</TabsTrigger> : null}
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="issues">
              Issues
              {problems > 0 ? (
                <span className="rounded-full bg-highlight-yellow-50 px-1.5 text-type-caption-1 text-text-warning tabular-nums">
                  {problems}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          {/* relative: absolutely placed text (screen-reader labels far down a list) stays in this
              scroll; without it the page itself grows and scrolls, leaving space below. */}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="content">
              <ContentPanel
                sections={sections}
                selected={selected}
                onSelect={setSelected}
                onEdit={edit}
                pending={pending}
              />
            </TabsContent>
            <TabsContent value="look">
              <LookPanel look={state.look} analysis={state.template.analysis} />
            </TabsContent>
            {cloned ? (
              <TabsContent value="rules">
                <RulesPanel
                  key={`${state.template.analysis?.analysed_at}-${version}`}
                  state={state}
                  onState={setState}
                />
              </TabsContent>
            ) : null}
            <TabsContent value="details">
              <DetailsPanel
                key={state.template.id}
                state={state}
                pending={pending}
                analysing={analysing}
                onAnalyse={analyse}
                onRestore={restore}
                onSaved={(details) =>
                  setState((current) => ({
                    ...current,
                    template: {
                      ...current.template,
                      name: details.name,
                      description: details.description || null,
                    },
                  }))
                }
              />
            </TabsContent>
            <TabsContent value="issues">
              <IssuesPanel issues={state.issues} onShow={showSection} />
            </TabsContent>
          </div>
        </Tabs>
        <EditorPreview
          templateId={templateId}
          version={version}
          selected={selected}
          onSelect={setSelected}
          sections={state.sections.length}
          minutes={state.read_minutes}
        />
      </div>
    </div>
  );
}

function ShortcutButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-disabled={disabled || undefined}
          aria-keyshortcuts={shortcut === "⌘Z" ? "Meta+Z" : "Meta+Shift+Z"}
          onClick={disabled ? undefined : onClick}
          className="text-sub-text aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {children}
          <span className="sr-only sm:not-sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <kbd className="font-sans text-caption-1">{shortcut}</kbd>
      </TooltipContent>
    </Tooltip>
  );
}
