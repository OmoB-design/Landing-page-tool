"use client";

import { IconAction } from "@/components/app/icon-action";
import {
  type DragHandleProps,
  SortableList,
} from "@/components/app/sortable-list";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  DuplicateFigmaIcon,
  GripDotsIcon,
  MoveDownFigmaIcon,
  MoveUpFigmaIcon,
  RemoveFigmaIcon,
} from "@/components/ui/lp-icons";
import { canMoveSection, keepsGroups } from "@/lib/pages/editor";
import { moved } from "@/lib/templates/editor";
import { cn } from "@/lib/utils";
import type {
  DeskParagraph,
  DeskSection,
  SectionAction,
} from "@/lib/validators/desk";

import { LanderMark } from "./lander/lander-mark";

const CROSS_CONTAINER =
  "That section can't move there: it sits in a different part of the page.";

/**
 * The page editor's left panel (B3.1a; drawn as the template editor's Content tab): the selected
 * section (its place, move up and down, duplicate, remove, by the template's rules, and Improve
 * with AI, which hands it to the composer) over the page's sections (click to select, drag to
 * reorder). Every change is one undoable step.
 */
export function SectionPanel({
  layout,
  paragraphs,
  selected,
  busy,
  onSelect,
  onEdit,
  onImprove,
}: {
  layout: DeskSection[];
  paragraphs: DeskParagraph[];
  selected: string | null;
  /** A change is saving or a redraft is running: section changes wait. */
  busy: string | null;
  onSelect: (key: string) => void;
  onEdit: (action: SectionAction) => void;
  onImprove: (key: string) => void;
}) {
  const index = layout.findIndex((s) => s.key === selected);
  const section = layout[index];
  const keys = layout.map((s) => s.key);
  const lines = section
    ? paragraphs.filter((p) => p.section === section.key)
    : [];
  const editable = lines.filter((p) => !p.locked).length;
  return (
    <div className="flex flex-col gap-2 p-4">
      <h2 className="flex h-9 items-center text-type-body-small font-medium">
        Selected section
      </h2>
      {section ? (
        <div className="flex flex-col gap-3 pb-2">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="line-clamp-2 text-type-body-small font-medium">
                {section.label}
              </p>
              <span className="text-type-caption-1 text-sub-text tabular-nums">
                Section {index + 1} of {layout.length}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconAction
                icon={MoveUpFigmaIcon}
                label="Move up"
                unavailable={
                  busy ??
                  (canMoveSection(layout, index, -1)
                    ? null
                    : index === 0
                      ? "Already at the top"
                      : "It can't move past the section above (a different part of the page)")
                }
                onClick={() =>
                  onEdit({
                    type: "reorder",
                    keys: moved(keys, index, -1),
                    moved: section.key,
                  })
                }
              />
              <IconAction
                icon={MoveDownFigmaIcon}
                label="Move down"
                unavailable={
                  busy ??
                  (canMoveSection(layout, index, 1)
                    ? null
                    : index === layout.length - 1
                      ? "Already at the bottom"
                      : "It can't move past the section below (a different part of the page)")
                }
                onClick={() =>
                  onEdit({
                    type: "reorder",
                    keys: moved(keys, index, 1),
                    moved: section.key,
                  })
                }
              />
              <IconAction
                icon={DuplicateFigmaIcon}
                label="Duplicate"
                unavailable={
                  busy ??
                  (section.duplicable
                    ? null
                    : "This section can't be duplicated")
                }
                onClick={() => onEdit({ type: "duplicate", key: section.key })}
              />
              <IconAction
                icon={RemoveFigmaIcon}
                label="Remove"
                unavailable={
                  busy ??
                  (!section.removable
                    ? "This section can't be removed"
                    : layout.length === 1
                      ? "A page needs at least one section"
                      : null)
                }
                onClick={() => onEdit({ type: "remove", key: section.key })}
              />
            </div>
          </div>
          <p className="text-type-caption-1 text-sub-text">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
            {editable < lines.length
              ? ` · ${lines.length - editable} filled from data`
              : ""}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={Boolean(busy) || editable === 0}
            onClick={() => onImprove(section.key)}
          >
            {/* Buddy (owner, 2026-11-06): it opens a request to him on this section. */}
            <LanderMark size="xs" mouth />
            Improve with Buddy
          </Button>
        </div>
      ) : (
        <p className="pb-2 text-type-caption-1 text-sub-text">
          Select a section in the list or on the page.
        </p>
      )}
      <h2 className="flex h-9 items-center border-t border-stroke pt-2 text-type-body-small font-medium">
        The page · {layout.length}{" "}
        {layout.length === 1 ? "section" : "sections"}
      </h2>
      <SortableList
        ids={keys}
        label="Sections"
        itemName={(key) => layout.find((s) => s.key === key)?.label ?? key}
        disabled={Boolean(busy)}
        onReorder={(order, movedKey) => {
          if (!keepsGroups(layout, order)) {
            toast.error(CROSS_CONTAINER);
            return;
          }
          onEdit({ type: "reorder", keys: order, moved: movedKey });
        }}
        renderItem={(key, handle, { dragging }) => {
          const item = layout.find((s) => s.key === key);
          return item ? (
            <SectionRow
              section={item}
              position={keys.indexOf(key) + 1}
              selected={key === selected}
              dragging={dragging}
              handle={handle}
              onSelect={() => onSelect(key)}
            />
          ) : null;
        }}
      />
    </div>
  );
}

function SectionRow({
  section,
  position,
  selected,
  dragging,
  handle,
  onSelect,
}: {
  section: DeskSection;
  position: number;
  selected: boolean;
  dragging: boolean;
  handle: DragHandleProps;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "group/row relative flex h-9 items-center rounded-md bg-foreground-01",
        selected ? "bg-foreground-03" : "hover:bg-foreground-02",
        dragging && "shadow-pop",
      )}
    >
      <span
        {...handle}
        aria-label={`Move ${section.label}`}
        className="ml-1.5 flex h-full w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-xsm text-icon-system opacity-0 outline-none group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripDotsIcon aria-hidden className="size-4" />
      </span>
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-md pr-2.5 pl-1 text-left text-type-caption-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="w-6 shrink-0 font-medium text-highlight-yellow-500 tabular-nums">
          {String(position).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-right",
            selected && "font-medium",
          )}
        >
          {section.label}
        </span>
      </button>
    </div>
  );
}
