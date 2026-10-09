"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type HTMLAttributes, type ReactNode, useId } from "react";

/** Props for the element that starts a drag (a handle), from `SortableList`'s `renderItem`. */
export type DragHandleProps = HTMLAttributes<HTMLElement> & {
  ref: (element: HTMLElement | null) => void;
};

type SortableListProps = {
  ids: string[];
  /** Accessible name of the list, e.g. "Sections". */
  label: string;
  /** Names an item for screen-reader announcements ("Moved Hero to position 3 of 12"). */
  itemName: (id: string) => string;
  /** Called with the new order and the moved item when a drag ends somewhere new. */
  onReorder: (ids: string[], moved: string) => void;
  disabled?: boolean;
  renderItem: (
    id: string,
    handle: DragHandleProps,
    state: { dragging: boolean },
  ) => ReactNode;
};

/**
 * A vertical list reordered by dragging a handle, with the pointer or the keyboard (focus the
 * handle, Space to pick up, arrows to move, Space to drop, Escape to cancel). Wraps dnd-kit so
 * feature code doesn't import it (D20).
 */
export function SortableList({
  ids,
  label,
  itemName,
  onReorder,
  disabled = false,
  renderItem,
}: SortableListProps) {
  // dnd-kit numbers its accessibility ids per page load; a React id keeps them the same in the
  // server HTML and in the browser (no hydration mismatch).
  const id = useId();
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so clicks on the handle still work.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const position = (id: string | number) =>
    `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onReorder(arrayMove(ids, from, to), String(active.id));
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To move a section, press Space to pick it up, use the arrow keys to move it, then press Space to drop it or Escape to cancel.",
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${itemName(String(active.id))}, ${position(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${itemName(String(active.id))} is over ${position(over.id)}.`
              : `${itemName(String(active.id))} is no longer over the list.`,
          onDragEnd: ({ active, over }) =>
            over
              ? `Dropped ${itemName(String(active.id))} at ${position(over.id)}.`
              : `Dropped ${itemName(String(active.id))}.`,
          onDragCancel: ({ active }) =>
            `Cancelled. ${itemName(String(active.id))} stays where it was.`,
        },
      }}
    >
      <SortableContext
        items={ids}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <ul role="list" aria-label={label} className="flex flex-col gap-1">
          {ids.map((id) => (
            <SortableRow key={id} id={id} renderItem={renderItem} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  renderItem,
}: {
  id: string;
  renderItem: SortableListProps["renderItem"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={isDragging ? "relative z-10" : undefined}
    >
      {renderItem(
        id,
        { ...attributes, ...listeners, ref: setActivatorNodeRef },
        { dragging: isDragging },
      )}
    </li>
  );
}
