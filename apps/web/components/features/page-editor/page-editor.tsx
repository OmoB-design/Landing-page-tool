"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Mover } from "@/components/app/mover";
import {
  type LanderSuggestion,
  type LanderTarget,
  changedLineNumbers,
  suggestions as suggestionsFor,
} from "@/lib/pages/lander";
import { addedKey, selectionAfterRemove } from "@/lib/templates/editor";
import type { SectionAction } from "@/lib/validators/desk";

import { useDesk } from "../builds/desk-context";
import { EditorTopBar } from "./editor-top-bar";
import type { UndoState } from "./lander/change-card";
import { FloatingComposer } from "./lander/floating-composer";
import { LanderComposer } from "./lander/lander-composer";
import { LanderRecents } from "./lander/lander-recents";
import { LanderPanel, PANEL_WIDTH } from "./lander/lander-panel";
import { LanderThread } from "./lander/lander-thread";
import { type TurnView, useLander } from "./lander/use-lander";
import { LanderMotionProvider, useLanderMotion } from "./lander-motion";
import { type FlashRequest, PageCanvas, type Viewport } from "./page-canvas";
import { SectionPanel } from "./section-panel";

/** The canvas gap between the page and Lander's panel (the frame's 6 px). */
const GAP = 6;
/** The section list's widths: Shopify's theme editor size by default (owner, 2026-11-04). */
const SECTIONS_MIN = 260;
const SECTIONS_MAX = 420;
const SECTIONS_DEFAULT = 300;
/** Lander's panel squeezes the page from this width; narrower, it lies over the page. */
const WIDE = "(min-width: 1100px)";
const STORE = {
  sections: "lp-page-editor-sections",
  // v2: the list got narrower (300 px); widths remembered from the wider list start over.
  sectionsWidth: "lp-page-editor-sections-width-v2",
};

const noSubscribe = () => () => {};
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}
function widthIn(min: number, max: number) {
  return (raw: string | null) => {
    const value = Number(raw);
    return raw !== null && value >= min && value <= max ? value : null;
  };
}
function useStored<T>(key: string, parse: (raw: string | null) => T | null) {
  return useSyncExternalStore(
    noSubscribe,
    () => parse(read(key)),
    () => null,
  );
}
function useWide(): boolean {
  return useSyncExternalStore(
    (change) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", change);
      return () => query.removeEventListener("change", change);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

/**
 * The page editor (BUILD_SPEC §11.2; B3.1a, D104; reorganised in B3.1b, D105, after Shopify's
 * Sidekick, docs/reference/sidekick-study.md). The page fills the editor: the top bar, then the page
 * (Desktop or Phone; click a line to type), with "Work with Lander" floating at its foot. Sections
 * opens the section list on the left (resizable, remembered). Opening Lander (its bar, ⌘J, Improve
 * with AI, or sending a request) sinks the bar, squeezes the page and brings Lander's panel in
 * beside it, and puts the section list away so the page keeps its room; closing Lander reverses
 * it, and brings the list back if it was open. Sections pressed while Lander is open shows both.
 * In development a DialKit panel tunes all of the motion.
 */
export function PageEditor({
  build,
}: {
  build: { id: string; key: string; title: string; updatedAt: string };
}) {
  const [landerOpen, setLanderOpen] = useState(false);
  const replay = useCallback(() => {
    setLanderOpen(false);
    window.setTimeout(() => setLanderOpen(true), 900);
  }, []);
  return (
    <LanderMotionProvider onReplay={replay}>
      <Editor
        build={build}
        landerOpen={landerOpen}
        setLanderOpen={setLanderOpen}
      />
    </LanderMotionProvider>
  );
}

function Editor({
  build,
  landerOpen,
  setLanderOpen,
}: {
  build: { id: string; key: string; title: string; updatedAt: string };
  landerOpen: boolean;
  setLanderOpen: (open: boolean | ((open: boolean) => boolean)) => void;
}) {
  const motionConfig = useLanderMotion();
  const { desk, undo, redo, editSections, pending } = useDesk();

  // The selected section: drives the canvas's outline and what Lander's requests are about.
  const layout = desk.layout;
  const [chosen, setChosen] = useState<string | null>(layout[0]?.key ?? null);
  const [after, setAfter] = useState<{ before: string[] } | null>(null);
  const keys = layout.map((s) => s.key);
  if (after && keys.join() !== after.before.join()) {
    setAfter(null);
    setChosen(addedKey(after.before, keys) ?? chosen);
  }
  const selected = chosen && keys.includes(chosen) ? chosen : (keys[0] ?? null);
  const section = layout.find((s) => s.key === selected) ?? null;
  // Lander's requests are about the whole page until you pick a section (on the page or the list).
  const [wholePage, setWholePage] = useState(true);
  const target: LanderTarget =
    section && !wholePage ? { key: section.key, label: section.label } : null;

  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [focusSignal, setFocusSignal] = useState(0);
  // The bar's first rise (opening the editor) waits a moment; later rises don't.
  const [barArrived, setBarArrived] = useState(false);
  const settleRef = useRef<(() => Promise<void>) | null>(null);
  const settle = useCallback(async () => {
    await settleRef.current?.();
  }, []);
  const lander = useLander(build.id, settle);

  // The section list: closed by default, its state and width remembered per browser.
  const savedOpen = useStored(STORE.sections, (raw) =>
    raw === null ? null : raw === "open",
  );
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const sectionsWanted = openChoice ?? savedOpen ?? false;
  // Lander puts the list away while it's open (the page keeps its room) unless Sections was pressed
  // with Lander open; each time Lander opens, that starts over.
  const [beside, setBeside] = useState(false);
  const [landerWasOpen, setLanderWasOpen] = useState(landerOpen);
  if (landerWasOpen !== landerOpen) {
    setLanderWasOpen(landerOpen);
    if (landerOpen) setBeside(false);
  }
  const sectionsOpen = sectionsWanted && (!landerOpen || beside);
  const toggleSections = () => {
    if (sectionsOpen) {
      setOpenChoice(false);
      setBeside(false);
      remember(STORE.sections, "closed");
      return;
    }
    setOpenChoice(true);
    if (landerOpen) setBeside(true);
    remember(STORE.sections, "open");
  };
  const savedSectionsWidth = useStored(
    STORE.sectionsWidth,
    widthIn(SECTIONS_MIN, SECTIONS_MAX),
  );
  const [sectionsChoice, setSectionsWidth] = useState<number | null>(null);
  const sectionsWidth =
    sectionsChoice ?? savedSectionsWidth ?? SECTIONS_DEFAULT;
  const landerWidth = PANEL_WIDTH;
  const wide = useWide();
  const page = useRef<HTMLElement>(null);
  const sectionsMax = useCallback(
    () => Math.min(SECTIONS_MAX, (page.current?.clientWidth ?? 1200) - 520),
    [],
  );

  const busy = desk.redraft
    ? "Lander is rewriting the page. Changes wait until it’s done."
    : pending
      ? "Saving…"
      : null;
  const select = (key: string) => {
    setChosen(key);
    setWholePage(false);
  };
  const edit = async (action: SectionAction) => {
    const before = keys;
    await settle();
    const done = await editSections(action);
    if (!done) return;
    if (action.type === "remove")
      setChosen(selectionAfterRemove(before, action.key));
    else if (action.type === "duplicate") setAfter({ before });
  };

  const openLander = useCallback(() => {
    setLanderOpen(true);
    setFocusSignal((n) => n + 1);
  }, [setLanderOpen]);
  const send = (
    text: string,
    to: LanderTarget = target,
    images: string[] = [],
  ) => {
    setLanderOpen(true);
    void lander.send(text, to, images);
  };
  const improve = (key: string) => {
    select(key);
    openLander();
  };

  // Show on page: a card's lines flash on the page as it is; a request that finished in this visit
  // flashes everything it rewrote, on the page it made.
  const [flash, setFlash] = useState<FlashRequest | null>(null);
  const showOnPage = (lines: number[], section: string | null) => {
    if (section) select(section);
    setFlash((f) => ({
      nonce: (f?.nonce ?? 0) + 1,
      blocks: lines,
      version: 0,
    }));
  };
  const lastDone = [...lander.views]
    .reverse()
    .find(
      (v) =>
        (v.state === "done" || v.state === "stopped") && v.turn.saved === null,
    );
  const [flashedFor, setFlashedFor] = useState<string | null>(null);
  if (lastDone && lastDone.turn.id !== flashedFor) {
    setFlashedFor(lastDone.turn.id);
    setFlash((f) => ({
      nonce: (f?.nonce ?? 0) + 1000,
      blocks: changedLineNumbers(lastDone.changes),
      version: lastDone.versionAfter ?? 0,
    }));
  }

  // Undo under a request's changes: only the newest request of its kind, and only while nothing
  // came after it.
  const undoFor = (view: TurnView): UndoState => {
    const finished = view.state === "done" || view.state === "stopped";
    if (!finished || view.versionAfter === null || !view.reason) return "none";
    const newest = [...lander.views]
      .reverse()
      .find(
        (v) =>
          (v.state === "done" || v.state === "stopped") &&
          v.reason === view.reason,
      );
    if (newest?.turn.id !== view.turn.id) return "later";
    if (desk.redraft) return "later";
    if (
      desk.snapshots[0]?.reason === view.reason &&
      desk.build.page_version >= view.versionAfter
    )
      return "can-undo";
    if (desk.can_redo && desk.redo_reason === view.reason) return "undone";
    return "later";
  };

  const canUndo = desk.snapshots.length > 0 && !busy;
  const canRedo = desk.can_redo && !busy;
  const latest = useRef({ undo, redo, canUndo, canRedo });
  useEffect(() => {
    latest.current = { undo, redo, canUndo, canRedo };
  });
  const onUndo = useCallback(() => {
    if (!latest.current.canUndo) return;
    void settle().then(() => latest.current.undo());
  }, [settle]);
  const onRedo = useCallback(() => {
    if (!latest.current.canRedo) return;
    void settle().then(() => latest.current.redo());
  }, [settle]);
  // ⌘Z / ⇧⌘Z undo and redo (not while typing in a field); ⌘J opens or closes Lander.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        setLanderOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (key === "z" && !event.shiftKey) onUndo();
      else if ((key === "z" && event.shiftKey) || key === "y") onRedo();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRedo, onUndo, setLanderOpen]);

  const first = lander.views[0]?.turn;
  const title = first
    ? first.request ||
      `Fresh words for ${first.target ? first.target.label : "the page"}`
    : null;
  const picks = suggestionsFor(layout, section, desk.paragraphs);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <main
        ref={page}
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-panel bg-surface-primary edge"
      >
        <EditorTopBar
          build={build}
          saving={saving || pending !== null}
          updating={updating}
          zoom={zoom}
          version={desk.build.page_version}
          rewriting={desk.redraft !== null}
          sectionsOpen={sectionsOpen}
          onToggleSections={toggleSections}
          viewport={viewport}
          onViewport={setViewport}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
        <div className="flex min-h-0 min-w-0 flex-1">
          <motion.div
            initial={false}
            animate={{ width: sectionsOpen ? sectionsWidth : 0 }}
            transition={motionConfig.sectionsToggle}
            className="relative shrink-0"
          >
            <div className="absolute inset-0 overflow-hidden divider-r-thin">
              {/* The list keeps its width while the drawer slides, so nothing reflows inside it. */}
              <div
                className="h-full overflow-y-auto"
                style={{ width: sectionsWidth }}
              >
                <SectionPanel
                  layout={layout}
                  paragraphs={desk.paragraphs}
                  selected={selected}
                  busy={busy}
                  onSelect={select}
                  onEdit={(action) => void edit(action)}
                  onImprove={improve}
                />
              </div>
            </div>
            {sectionsOpen ? (
              <Mover
                value={sectionsWidth}
                min={SECTIONS_MIN}
                max={sectionsMax}
                defaultValue={SECTIONS_DEFAULT}
                side="left"
                label="Resize the section list"
                onChange={setSectionsWidth}
                onCommit={(value) =>
                  remember(STORE.sectionsWidth, String(value))
                }
                className="absolute top-1/2 -right-2 z-10 hidden -translate-y-1/2 lg:flex"
              />
            ) : null}
          </motion.div>
          <div className="relative flex min-w-0 flex-1 flex-col">
            <PageCanvas
              buildId={build.id}
              updatedAt={build.updatedAt}
              selected={selected}
              onSelect={select}
              onSaving={setSaving}
              onUpdating={setUpdating}
              onZoom={setZoom}
              onUndo={onUndo}
              onRedo={onRedo}
              settleRef={settleRef}
              viewport={viewport}
              busyLines={lander.busyLines}
              flash={flash}
            />
            <div
              className="pointer-events-none absolute inset-x-4 z-20 flex justify-center"
              // The bar's place, tunable on the DialKit panel (data, not styling).
              style={{ bottom: motionConfig.barFromBottom }}
            >
              {/* Opening the editor, the bar rises into place from the page's foot (owner,
                  2026-11-05); afterwards it rises as Lander's panel closes. */}
              <AnimatePresence>
                {landerOpen ? null : (
                  <motion.div
                    key="bar"
                    className="flex w-full justify-center"
                    initial={{
                      y: motionConfig.barDistance,
                      opacity: motionConfig.reduced ? 0 : 1,
                    }}
                    animate={{
                      y: 0,
                      opacity: 1,
                      transition: barArrived
                        ? motionConfig.barRise
                        : {
                            ...motionConfig.barRise,
                            delay: motionConfig.barEnterDelay,
                          },
                    }}
                    onAnimationComplete={() => setBarArrived(true)}
                    exit={{
                      y: motionConfig.barDistance,
                      opacity: motionConfig.reduced ? 0 : 1,
                      transition: motionConfig.barSink,
                    }}
                  >
                    <FloatingComposer
                      working={lander.working}
                      onSend={(text) => send(text)}
                      onOpen={openLander}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </main>
      <AnimatePresence initial={false}>
        {landerOpen ? (
          <motion.div
            key="lander"
            className="relative shrink-0"
            initial={{ width: 0 }}
            animate={{
              width: wide ? landerWidth + GAP : 0,
              transition: motionConfig.pageSqueeze,
            }}
            exit={{ width: 0, transition: motionConfig.pageWiden }}
          >
            <motion.aside
              aria-label="Lander"
              className={
                wide
                  ? "absolute inset-y-0 right-0 z-10"
                  : "absolute inset-y-0 right-0 z-30 rounded-panel shadow-float"
              }
              // The panel's width follows the Mover (data, not styling).
              style={{ width: landerWidth, transformOrigin: "right center" }}
              initial={{
                opacity: 0,
                scale: motionConfig.panelScaleFrom,
                filter: `blur(${motionConfig.panelBlurFrom}px)`,
              }}
              animate={{
                opacity: 1,
                scale: 1,
                filter: "blur(0px)",
                transition: motionConfig.panelEnter,
              }}
              exit={{
                opacity: 0,
                scale: motionConfig.panelScaleFrom,
                filter: `blur(${motionConfig.panelBlurFrom}px)`,
                transition: motionConfig.panelExit,
              }}
            >
              <LanderPanel
                title={title}
                working={lander.working}
                recents={
                  <LanderRecents
                    current={lander.threadId}
                    disabled={lander.working}
                    onList={lander.listThreads}
                    onOpen={(id) => void lander.openThread(id)}
                  />
                }
                onNewChat={lander.reset}
                onClose={() => setLanderOpen(false)}
              >
                <LanderThread
                  views={lander.views}
                  suggestions={picks}
                  undoFor={undoFor}
                  onSuggestion={(s: LanderSuggestion) => {
                    if (s.target) select(s.target.key);
                    else setWholePage(true);
                    send(s.text, s.target);
                  }}
                  onUndo={onUndo}
                  onRedo={onRedo}
                  onShow={showOnPage}
                  onRefine={(to, request) => send(request, to)}
                  onRetry={(view) => send(view.turn.request, view.turn.target)}
                  onRate={(jobId, feedback) =>
                    void lander.rate(jobId, feedback)
                  }
                  composer={
                    <LanderComposer
                      target={target}
                      working={lander.working}
                      hasThread={lander.views.length > 0}
                      stopping={lander.stopping}
                      onStop={() => void lander.stop()}
                      focusSignal={focusSignal}
                      onClearTarget={() => setWholePage(true)}
                      onSend={(text, images) => send(text, target, images)}
                    />
                  }
                />
              </LanderPanel>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
