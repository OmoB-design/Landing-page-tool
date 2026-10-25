"use client";

import { formatDistanceToNowStrict } from "date-fns";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { UndoIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  CardChevronIcon,
  LockFigmaIcon,
  SearchFigmaIcon,
} from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { groupParagraphs, wizardChoices } from "@/lib/builds/desk";
import { useHydrated } from "@/lib/use-hydrated";
import { sentence } from "@/lib/builds/report";
import { cn } from "@/lib/utils";
import { AUTHOR_TYPES, GENDERS, IMAGE_STYLES } from "@/lib/wizard/state";
import type { DeskParagraph, DeskSnapshot } from "@/lib/validators/desk";

import { type DeskTab, useDesk } from "./desk-context";
import { CollapsibleSection, PanelSection } from "./panel-section";

/**
 * The review desk's right panel (D84; Figma Review desk — editing copy): Overview (the build
 * steps, facts, claim check and reminders, under `overview`), Copy (every line of the page, to
 * edit) and History (the snapshots, with Undo and Restore). The tabs sit in a Foreground-01 frame
 * (0.5 px Stroke, 8 px corners, Shadow/Light); the chosen one is Surface-Primary with a 0.5 px
 * Stroke-Strong line and Shadow/Panel.
 */
export function DeskPanel({ overview }: { overview: ReactNode }) {
  const { tab, setTab, desk } = useDesk();
  const editable = desk.fragments.filter((f) => !f.locked).length;
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as DeskTab)}
      className="gap-2.5"
    >
      <TabsList
        aria-label="Page panel"
        className="w-full gap-0 rounded-md bg-foreground-01 p-0.5 shadow-light ring-half ring-stroke ring-inset dark:bg-dashboard"
      >
        <DeskTabTrigger value="overview">Overview</DeskTabTrigger>
        <DeskTabTrigger value="copy" count={editable}>
          Copy
        </DeskTabTrigger>
        <DeskTabTrigger
          value="history"
          count={desk.snapshots.length || undefined}
        >
          History
        </DeskTabTrigger>
      </TabsList>
      <TabsContent value="overview" forceMount hidden={tab !== "overview"}>
        {overview}
      </TabsContent>
      <TabsContent value="copy">
        <CopyPanel />
      </TabsContent>
      <TabsContent value="history">
        <HistoryPanel />
      </TabsContent>
    </Tabs>
  );
}

function DeskTabTrigger({
  value,
  count,
  children,
}: {
  value: DeskTab;
  count?: number;
  children: ReactNode;
}) {
  return (
    <TabsTrigger value={value} variant="segmented">
      {children}{" "}
      {count !== undefined ? (
        <span className="text-heading-05 tabular-nums">{count}</span>
      ) : null}
    </TabsTrigger>
  );
}

/**
 * Copy (Figma Review desk, Copy): the search (32 px) and its hint, then the page's sections, each a
 * folding block between 0.5 px Stroke lines: the section's name (12 px medium Heading-05) and an
 * 18 px chevron, then its paragraphs 4 px apart. A paragraph is one text even when bold words, a
 * link or a price split it; clicking it (here or on the page) turns its row into the field. The
 * first section starts open; the others fold until opened, a paragraph in them is clicked on the
 * page, or a search matches them.
 */
export function CopyPanel() {
  const { desk, editing, focus } = useDesk();
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<number | null>(null);
  const searching = query.trim() !== "";
  const groups = groupParagraphs(desk.paragraphs, query, desk.sections);
  const searchId = useId();
  const keyOf = (index: number) =>
    `${groups[index]?.section ?? "page"}-${index}`;

  // A paragraph opened from the preview or a claim opens its section once (it can be folded again).
  const active = editing ?? focus?.block ?? null;
  if (active !== revealed) {
    setRevealed(active);
    const index = groups.findIndex((group) =>
      group.paragraphs.some((paragraph) => paragraph.number === active),
    );
    if (index >= 0 && folded[keyOf(index)] !== false) {
      setFolded((current) => ({ ...current, [keyOf(index)]: false }));
    }
  }

  // …and scrolls into view here.
  useEffect(() => {
    if (!editing) return;
    document
      .getElementById(`desk-paragraph-${editing}`)
      ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [editing]);

  return (
    <div className="flex flex-col gap-2.5 pt-1.5">
      <div className="flex flex-col gap-2.5">
        <label htmlFor={searchId} className="sr-only">
          Search the page’s words
        </label>
        <div className="relative">
          <SearchFigmaIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-icon-system" />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the page’s words"
            className="h-8 pr-3 pl-8"
          />
        </div>
        <p className="text-type-caption-1 font-medium text-sub-text dark:text-heading-05">
          Click a line, here or on the page, to edit it.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium text-heading-02">
          No lines match “{query.trim()}”.
        </p>
      ) : (
        groups.map((group, index) => {
          const key = keyOf(index);
          const open = searching || !(folded[key] ?? index !== 0);
          return (
            <CopySection
              key={key}
              label={group.label}
              first={index === 0}
              open={open}
              onToggle={() =>
                setFolded((current) => ({ ...current, [key]: open }))
              }
            >
              {group.paragraphs.map((paragraph) => (
                <ParagraphRow key={paragraph.number} paragraph={paragraph} />
              ))}
            </CopySection>
          );
        })
      )}
    </div>
  );
}

/** A section of the Copy tab (Figma Review desk: a folding block 10 px apart, closed by a 0.5 px
 * Stroke line 10 px below; the first has a line 10 px above too and sits 16 px further down).
 * Toggled often, so only the chevron turns. */
function CopySection({
  label,
  first,
  open,
  onToggle,
  children,
}: {
  label: string;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = useId();
  return (
    <section
      className={cn(
        "flex flex-col gap-2.5 pb-2.5",
        first ? "mt-4 pt-2.5 divider-y-half" : "divider-b-half",
      )}
    >
      <h3 className="flex">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          className="group flex h-4.5 flex-1 items-center justify-between rounded-xsm text-left text-type-caption-1 font-medium text-heading-05 outline-none hover:text-heading-02 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
          <span
            aria-hidden
            className={cn(
              "flex size-4.5 items-center justify-center text-icon-system transition-transform duration-200 ease-out motion-reduce:transition-none",
              !open && "-rotate-90",
            )}
          >
            <CardChevronIcon />
          </span>
        </button>
      </h3>
      <ol id={contentId} hidden={!open} className="flex flex-col gap-1">
        {children}
      </ol>
    </section>
  );
}

/** A paragraph (Figma Review desk, Desk/Line): Rest, Hover, Outlined (1 px Spot-500-Blue: the
 * paragraph outlined in the preview), Edited and Locked (filled from the brand or product). Open,
 * the row becomes the field. */
function ParagraphRow({ paragraph }: { paragraph: DeskParagraph }) {
  const { editing, setEditing, show, focus } = useDesk();
  const open = editing === paragraph.number && !paragraph.locked;
  return (
    <li id={`desk-paragraph-${paragraph.number}`}>
      {open ? (
        <ParagraphEditor key={paragraph.number} paragraph={paragraph} />
      ) : (
        <button
          type="button"
          onClick={() => {
            show({ block: paragraph.number });
            setEditing(paragraph.locked ? null : paragraph.number);
          }}
          title={
            paragraph.locked
              ? "Filled from the brand or product: change it there"
              : undefined
          }
          className={cn(
            "flex w-full gap-1.5 rounded-md bg-foreground-01 p-1.5 text-left text-type-caption-1 font-medium transition-colors duration-150 ease-out outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring",
            paragraph.locked
              ? "items-center text-heading-05"
              : "items-start text-heading-02",
            focus?.block === paragraph.number && "ring-1 ring-spot-500-blue",
          )}
        >
          <span className="min-w-0 flex-1 break-words">{paragraph.text}</span>
          {paragraph.locked ? (
            <LockFigmaIcon
              aria-label="Locked"
              className="shrink-0 text-icon-system"
            />
          ) : paragraph.edited ? (
            <EditedChip />
          ) : null}
        </button>
      )}
    </li>
  );
}

function EditedChip() {
  return (
    <span className="shrink-0 rounded-lg bg-foreground-02 px-1.5 text-type-caption-2 font-medium text-heading-04">
      Edited
    </span>
  );
}

/** An open paragraph (Figma Review desk, Desk/Line editor): the field (Surface-Primary, 1 px
 * Spot-500-Blue, 10 px corners, Focus), then ⌘ Enter to save, Cancel and Save. Bold words and links
 * stay with their words; parts filled from data are named and stay as they are. */
function ParagraphEditor({ paragraph }: { paragraph: DeskParagraph }) {
  const { saveEdit, setEditing, pending } = useDesk();
  const [text, setText] = useState(paragraph.text);
  const field = useRef<HTMLTextAreaElement>(null);
  const saving = pending === "copy";
  const changed = text.trim() !== paragraph.text && text.trim() !== "";

  // Opening puts the cursor at the end, once; later clicks and selections stay where they land.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const save = () => {
    if (changed && !saving)
      void saveEdit(paragraph.number, paragraph.text, text);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-foreground-01 p-1.5">
      <Textarea
        aria-label="Edit this line"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        ref={field}
        disabled={saving}
        className="min-h-11.5 border-spot-500-blue px-2.5 pt-2 pb-4.5 shadow-focus"
      />
      {paragraph.locked_parts.length > 0 ? (
        <p className="px-0.5 text-type-caption-2 font-medium text-heading-05">
          {paragraph.locked_parts.map((part) => `“${part}”`).join(", ")}{" "}
          {paragraph.locked_parts.length === 1 ? "is" : "are"} filled from the
          brand or product and{" "}
          {paragraph.locked_parts.length === 1 ? "stays" : "stay"} as it is.
        </p>
      ) : null}
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 text-type-caption-2 font-medium text-heading-05">
          ⌘ Enter to save
        </span>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          onClick={() => setEditing(null)}
          disabled={saving}
          className="text-heading-01"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="compact"
          onClick={save}
          disabled={!changed || saving}
          className="px-4"
        >
          {saving ? <Spinner className="size-3" label="Saving" /> : null}
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

/**
 * History: every change saves the page first, newest at the top (the last 12 are kept). Undo puts
 * back the page before the last change; Restore makes the page before any kept change current
 * again, itself a change you can undo.
 */
export function HistoryPanel() {
  const { desk, undo, restore, pending, meId } = useDesk();
  const [latest] = desk.snapshots;
  return (
    <div className="flex flex-col pt-1.5">
      <button
        type="button"
        onClick={undo}
        disabled={!latest || pending !== null}
        className="flex items-center gap-1.5 rounded-md border-(length:--line-hairline) border-stroke-strong bg-surface-primary px-2.5 py-1.5 text-left text-type-caption-1 font-medium text-heading-01 shadow-panel transition-transform duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:bg-foreground-01 enabled:active:scale-97 disabled:text-heading-06"
      >
        {pending === "undo" ? (
          <Spinner className="size-3.5" label="Undoing" />
        ) : (
          <UndoIcon className="size-3.5 shrink-0 text-icon-system" />
        )}
        <span className="min-w-0 truncate">
          {latest ? `Undo: ${latest.reason}` : "Nothing to undo"}
        </span>
      </button>
      <PanelSection
        title="Changes"
        count={desk.snapshots.length || undefined}
        className="mt-2.5"
      >
        {desk.snapshots.length === 0 ? (
          <p className="rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium text-heading-02">
            No changes yet. Each change you make saves the page first, so you
            can undo it.
          </p>
        ) : (
          <ol className="flex flex-col gap-1">
            {desk.snapshots.map((snapshot) => (
              <SnapshotRow
                key={snapshot.seq}
                snapshot={snapshot}
                mine={snapshot.created_by === meId}
                busy={pending !== null}
                onRestore={() => restore(snapshot.seq)}
              />
            ))}
          </ol>
        )}
      </PanelSection>
    </div>
  );
}

function SnapshotRow({
  snapshot,
  mine,
  busy,
  onRestore,
}: {
  snapshot: DeskSnapshot;
  mine: boolean;
  busy: boolean;
  onRestore: () => void;
}) {
  return (
    <li className="flex items-center gap-1.5 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-heading-02">{snapshot.reason}</span>
        <span className="text-type-caption-2 text-heading-05">
          <Ago date={snapshot.created_at} /> · {mine ? "You" : "A teammate"}
        </span>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={busy}
        title="Make the page as it was before this change current again"
        className="shrink-0 rounded-sm border-(length:--line-hairline) border-stroke-strong bg-surface-primary px-2 py-0.75 text-type-caption-2 font-medium text-heading-01 shadow-panel transition-transform duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:bg-foreground-01 enabled:active:scale-97 disabled:text-heading-06"
      >
        Restore
      </button>
    </li>
  );
}

/**
 * Your choices (the desk's Overview, under the report): what the wizard was told, and who
 * approved the page; folded at first, like Details.
 */
export function DeskChoices({ wizard }: { wizard: unknown }) {
  const { desk, meId } = useDesk();
  const rows = wizardChoices(wizard, {
    authors: AUTHOR_TYPES,
    styles: IMAGE_STYLES,
    genders: GENDERS,
  });
  const { approved_at: approvedAt, approved_by: approvedBy } = desk.build;
  const hydrated = useHydrated();
  if (approvedAt) {
    rows.unshift([
      "Approved",
      `${hydrated ? `${ago(approvedAt)} ` : ""}by ${approvedBy === meId ? "you" : "a teammate"}`,
    ]);
  }
  if (rows.length === 0) return null;
  return (
    <div className="pt-2">
      <CollapsibleSection title="Your choices">
        <dl className="flex flex-col gap-1">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium"
            >
              <dt className="shrink-0 text-heading-02">{label}:</dt>
              <dd className="min-w-0 text-right text-heading-05">
                {sentence(value)}
              </dd>
            </div>
          ))}
        </dl>
      </CollapsibleSection>
    </div>
  );
}

/** "4 minutes ago". Shown once the page has hydrated: the server's clock and the browser's
 * can disagree by a second, which would make the two renders differ. */
function Ago({ date }: { date: string }) {
  const hydrated = useHydrated();
  return hydrated ? <>{ago(date)}</> : null;
}

function ago(date: string): string {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}
