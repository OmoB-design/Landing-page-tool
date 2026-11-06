/** The page editor's rules (B3.1a, D104), kept apart from the components so they can be tested. */
import type { DeskSection } from "@/lib/validators/desk";

/** Saves after you stop typing for this long (and when you leave the line). */
export const TYPING_PAUSE_MS = 1000;

/** Whether the section at `index` can move one place up (-1) or down (+1): sections in different
 * parts of the page (different containers) can't swap places. */
export function canMoveSection(
  layout: DeskSection[],
  index: number,
  delta: -1 | 1,
): boolean {
  const neighbour = layout[index + delta];
  return Boolean(neighbour) && neighbour?.group === layout[index]?.group;
}

/** Whether a dragged order keeps every section in its own part of the page. */
export function keepsGroups(layout: DeskSection[], order: string[]): boolean {
  const group = new Map(layout.map((s) => [s.key, s.group]));
  return layout.every((s, i) => group.get(order[i] ?? "") === s.group);
}

/** A line as the worker reads it: whitespace collapsed (paragraphs._collapse). */
export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// A line needs a letter (any script) or a price to be saved (paragraphs.rewrite).
const WORDS = /\p{L}|[$£€¥]\s?\d/u;

/** What to save for a line typed on the page, given what was saved last: the new text, or null
 * when there's nothing to save (unchanged) or it can't be saved yet (no words left). */
export function textToSave(lastSaved: string, typed: string): string | null {
  const text = collapse(typed);
  if (text === collapse(lastSaved)) return null;
  return WORDS.test(text) ? text : null;
}
