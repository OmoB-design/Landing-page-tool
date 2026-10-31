"use client";

import { type ComponentType, type SVGProps, useState } from "react";

import {
  type DragHandleProps,
  SortableList,
} from "@/components/app/sortable-list";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronUpIcon } from "@/components/ui/icons";
import {
  DuplicateFigmaIcon,
  GripDotsIcon,
  MoveDownFigmaIcon,
  MoveUpFigmaIcon,
  RemoveFigmaIcon,
} from "@/components/ui/lp-icons";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  canMove,
  itemNumber,
  keepsContainers,
  moved,
  roleLabel,
} from "@/lib/templates/editor";
import { cn } from "@/lib/utils";
import type { EditorSection, LayoutAction } from "@/lib/validators/template";

const CROSS_CONTAINER =
  "That section can't move there: it sits in a different part of the page.";

/** The Content tab: the selected section (move, duplicate, remove, rename; its words read-only)
 * over the whole template's section list (click to select, drag to reorder). */
export function ContentPanel({
  sections,
  selected,
  onSelect,
  onEdit,
  pending,
}: {
  sections: EditorSection[];
  selected: string | null;
  onSelect: (key: string) => void;
  onEdit: (action: LayoutAction) => void;
  pending: boolean;
}) {
  const index = sections.findIndex((s) => s.key === selected);
  const section = sections[index];
  const keys = sections.map((s) => s.key);
  return (
    <div className="flex flex-col gap-2 p-4">
      <Group title="Selected section">
        {section ? (
          <SelectedSection
            key={section.key}
            section={section}
            index={index}
            total={sections.length}
            canMoveUp={canMove(sections, index, -1)}
            canMoveDown={canMove(sections, index, 1)}
            pending={pending}
            onMove={(delta) =>
              onEdit({
                type: "reorder",
                keys: moved(keys, index, delta),
                moved: section.key,
              })
            }
            onEdit={onEdit}
          />
        ) : (
          <p className="text-type-caption-1 text-sub-text">
            Select a section in the list or in the preview.
          </p>
        )}
      </Group>
      <Group title={`Whole template · ${sections.length} sections`}>
        <SortableList
          ids={keys}
          label="Sections"
          itemName={(key) => sections.find((s) => s.key === key)?.label ?? key}
          disabled={pending}
          onReorder={(order, movedKey) => {
            if (!keepsContainers(sections, order)) {
              toast.error(CROSS_CONTAINER);
              return;
            }
            onEdit({ type: "reorder", keys: order, moved: movedKey });
          }}
          renderItem={(key, handle, { dragging }) => {
            const item = sections.find((s) => s.key === key);
            return item ? (
              <SectionRow
                section={item}
                selected={key === selected}
                dragging={dragging}
                handle={handle}
                onSelect={() => onSelect(key)}
              />
            ) : null;
          }}
        />
      </Group>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen
      className="border-t border-stroke pt-2 first:border-t-0 first:pt-0"
    >
      <h2>
        <CollapsibleTrigger className="group flex h-9 w-full items-center justify-between rounded-sm text-type-body-small font-medium outline-none hover:text-sub-text focus-visible:ring-2 focus-visible:ring-ring">
          {title}
          <ChevronUpIcon
            aria-hidden
            className="size-4 text-icon-system transition-transform duration-150 ease-out group-data-closed:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className="pt-1 pb-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function SectionRow({
  section,
  selected,
  dragging,
  handle,
  onSelect,
}: {
  section: EditorSection;
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
      {/* The grip sits inside the row, 6 px in, and shows on hover (owner, 2026-10-31); its
          place is kept, so the text never moves. */}
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
        {section.number ? (
          <span className="w-24 shrink-0 font-medium text-highlight-yellow-500 tabular-nums">
            {itemNumber(section.number)}
          </span>
        ) : (
          <span
            className={cn(
              "w-24 shrink-0 truncate",
              selected ? "text-heading-01" : "text-sub-text",
            )}
          >
            {roleLabel(section.role)}
          </span>
        )}
        {/* Figma 739:16410: the name sits at the row's right end. */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-right",
            (selected || section.number) && "font-medium",
          )}
        >
          {section.label}
        </span>
      </button>
    </div>
  );
}

function SelectedSection({
  section,
  index,
  total,
  canMoveUp,
  canMoveDown,
  pending,
  onMove,
  onEdit,
}: {
  section: EditorSection;
  index: number;
  total: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  pending: boolean;
  onMove: (delta: -1 | 1) => void;
  onEdit: (action: LayoutAction) => void;
}) {
  const details = [
    roleLabel(section.role),
    `${section.words} ${section.words === 1 ? "word" : "words"}`,
    ...(section.images > 0
      ? [`${section.images} ${section.images === 1 ? "image" : "images"}`]
      : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <SectionName
            label={section.label}
            disabled={pending}
            onRename={(label) =>
              onEdit({ type: "rename", key: section.key, label })
            }
          />
          <span className="shrink-0 text-type-caption-1 text-sub-text tabular-nums">
            Section {index + 1} of {total}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconAction
            icon={MoveUpFigmaIcon}
            label="Move up"
            unavailable={
              pending
                ? "Saving…"
                : !canMoveUp
                  ? index === 0
                    ? "Already at the top"
                    : "It can't move past the section above (a different part of the page)"
                  : null
            }
            onClick={() => onMove(-1)}
          />
          <IconAction
            icon={MoveDownFigmaIcon}
            label="Move down"
            unavailable={
              pending
                ? "Saving…"
                : !canMoveDown
                  ? index === total - 1
                    ? "Already at the bottom"
                    : "It can't move past the section below (a different part of the page)"
                  : null
            }
            onClick={() => onMove(1)}
          />
          <IconAction
            icon={DuplicateFigmaIcon}
            label="Duplicate"
            unavailable={
              pending
                ? "Saving…"
                : section.duplicable
                  ? null
                  : "This section can't be duplicated"
            }
            onClick={() => onEdit({ type: "duplicate", key: section.key })}
          />
          <IconAction
            icon={RemoveFigmaIcon}
            label="Remove"
            unavailable={
              pending
                ? "Saving…"
                : !section.removable
                  ? "This section can't be removed"
                  : total === 1
                    ? "A template needs at least one section"
                    : null
            }
            onClick={() => onEdit({ type: "remove", key: section.key })}
          />
        </div>
      </div>
      <p className="text-type-caption-1 text-sub-text">{details.join(" · ")}</p>
      {section.fields.length > 0 ? (
        <dl className="flex flex-col gap-1.5">
          {section.fields.map((field, i) => (
            <div
              key={`${field.label}-${i}`}
              className={cn(
                "rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1",
                field.text.length <= 40 &&
                  "flex items-baseline justify-between gap-4",
              )}
            >
              <dt className="shrink-0 text-sub-text">{field.label}</dt>
              <dd
                className={cn(
                  field.text.length <= 40 ? "truncate text-right" : "mt-1",
                )}
              >
                {field.text}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="text-type-caption-1 text-caption-2">
        Words are rewritten for each build, so they’re read-only here.
      </p>
    </div>
  );
}

/** The section's name: click to rename (Enter saves, Escape cancels). */
function SectionName({
  label,
  disabled,
  onRename,
}: {
  label: string;
  disabled: boolean;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  if (editing) {
    const save = () => {
      setEditing(false);
      const next = value.trim().replace(/\s+/g, " ");
      if (next && next !== label) onRename(next);
      else setValue(label);
    };
    return (
      <Input
        autoFocus
        aria-label="Section name"
        value={value}
        maxLength={80}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            setValue(label);
            setEditing(false);
          }
        }}
        className="h-8 min-w-0 flex-1"
      />
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setValue(label);
            setEditing(true);
          }}
          className="min-w-0 truncate rounded-sm text-left text-type-body-small font-medium outline-none hover:underline hover:decoration-caption-1 hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent>Rename</TooltipContent>
    </Tooltip>
  );
}

/** A square icon button with its name in a tooltip; when unavailable, the tooltip says why. */
function IconAction({
  icon: ActionIcon,
  label,
  unavailable,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  unavailable: string | null;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-disabled={unavailable ? true : undefined}
          onClick={unavailable ? undefined : onClick}
          className="bg-foreground-01 text-icon-system hover:bg-foreground-02 hover:text-body aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
        >
          <ActionIcon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{unavailable ?? label}</TooltipContent>
    </Tooltip>
  );
}
