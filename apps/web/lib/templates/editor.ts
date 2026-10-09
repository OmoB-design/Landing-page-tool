import type { EditorSection } from "@/lib/validators/template";

// Pure helpers for the section editor (BUILD_SPEC §8.3).

const ROLE_LABELS: Record<string, string> = {
  hero: "Hero",
  problem: "Problem",
  mechanism: "How it works",
  benefits: "Benefit",
  ingredients: "Ingredients",
  social_proof: "Proof",
  testimonials: "Reviews",
  comparison: "Comparison",
  offer: "Offer",
  guarantee: "Guarantee",
  faq: "FAQ",
  cta: "Call to action",
  footer_cta: "Closing",
  other: "Section",
};

/** The short type word shown before a section's name ("Hero", "FAQ"). */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? "Section";
}

/** A listicle item number as the list shows it: "1" → "01". */
export function itemNumber(number: string): string {
  return /^\d$/.test(number) ? number.padStart(2, "0") : number;
}

/**
 * Sections only reorder within the part of the page that holds them, so a valid order keeps the
 * same sequence of containers ("groups") from top to bottom.
 */
export function keepsContainers(
  sections: EditorSection[],
  order: string[],
): boolean {
  const group = new Map(sections.map((s) => [s.key, s.group]));
  return sections.every((s, i) => group.get(order[i] ?? "") === s.group);
}

/** Whether the section at `index` can move one place up (-1) or down (+1). */
export function canMove(
  sections: EditorSection[],
  index: number,
  delta: -1 | 1,
): boolean {
  const neighbour = sections[index + delta];
  return Boolean(neighbour) && neighbour?.group === sections[index]?.group;
}

/** The order after moving the section at `index` one place up or down. */
export function moved(keys: string[], index: number, delta: -1 | 1): string[] {
  const order = [...keys];
  const [key] = order.splice(index, 1);
  if (key !== undefined) order.splice(index + delta, 0, key);
  return order;
}

/** What to select after `key` is removed: the next section, or the previous at the end. */
export function selectionAfterRemove(
  keys: string[],
  key: string,
): string | null {
  const index = keys.indexOf(key);
  return keys[index + 1] ?? keys[index - 1] ?? null;
}

/** The section that a save added (a duplicate), if any. */
export function addedKey(before: string[], after: string[]): string | null {
  return after.find((key) => !before.includes(key)) ?? null;
}
