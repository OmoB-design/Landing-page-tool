"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { BackIcon, PagesIcon, RedoIcon, UndoIcon } from "@/components/ui/icons";
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
  undoTemplate,
} from "@/lib/templates/actions";
import { addedKey, selectionAfterRemove } from "@/lib/templates/editor";
import type {
  LayoutAction,
  TemplateEditorState,
} from "@/lib/validators/template";

import { ContentPanel } from "./content-panel";
import { DetailsPanel } from "./details-panel";
import { EditorPreview } from "./editor-preview";
import { IssuesPanel } from "./issues-panel";
import { LookPanel } from "./look-panel";

type Tab = "content" | "look" | "details" | "issues";

/**
 * The section editor (BUILD_SPEC §8.3, laid out like the owner's reference): a full-screen top
 * bar (back, name, save status, undo/redo, Create a page), a left panel with Content, Look,
 * Details and Issues tabs, and the live preview on the right. Every change is saved by the
 * worker as a new version; the preview reloads with it.
 */
export function TemplateEditor({ initial }: { initial: TemplateEditorState }) {
  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<Tab>("content");
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

  const problems = state.issues.filter((i) => i.severity !== "info").length;
  const showSection = (key: string) => {
    setSelected(key);
    setTab("content");
  };

  return (
    <div className="flex h-dvh flex-col bg-dashboard text-body">
      <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-stroke bg-surface-primary px-3 sm:px-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/templates?view=yours" aria-label="Back to templates">
            <BackIcon aria-hidden />
          </Link>
        </Button>
        <h1 className="min-w-0 truncate text-type-body-small font-semibold">
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
            <UndoIcon aria-hidden />
          </ShortcutButton>
          <ShortcutButton
            label="Redo"
            shortcut="⇧⌘Z"
            disabled={!state.can_redo || pending}
            onClick={redo}
          >
            <RedoIcon aria-hidden />
          </ShortcutButton>
          <Button size="sm" className="ml-1" asChild>
            <Link href={`/pages/new?template=${templateId}`}>
              <PagesIcon aria-hidden />
              <span className="sr-only sm:not-sr-only">Create a page</span>
            </Link>
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as Tab)}
          className="h-1/2 shrink-0 border-b border-stroke bg-surface-primary lg:h-auto lg:w-editor-panel lg:border-r lg:border-b-0"
        >
          <TabsList
            aria-label="Editor panels"
            className="shrink-0 border-b border-stroke px-4 py-2.5"
          >
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="look">Look</TabsTrigger>
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
          <div className="min-h-0 flex-1 overflow-y-auto">
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
              <LookPanel look={state.look} />
            </TabsContent>
            <TabsContent value="details">
              <DetailsPanel
                key={state.template.id}
                state={state}
                pending={pending}
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
