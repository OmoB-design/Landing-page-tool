import { sectionLabel } from "@/lib/builds/report";
import type {
  DeskParagraph,
  DeskRedraft,
  DeskState,
} from "@/lib/validators/desk";

/**
 * The desk to show: the one this tab last saved, unless the server has a newer page (another tab
 * or person changed it). The same version means the same page; this tab's copy is then at least
 * as fresh (an approval doesn't change the version, and this tab made it).
 */
export function pickDesk(
  local: DeskState | null,
  server: DeskState,
): DeskState {
  return local &&
    local.build.id === server.build.id &&
    local.build.page_version >= server.build.page_version
    ? local
    : server;
}

export type ParagraphGroup = {
  /** The section key, or null for text outside any section. */
  section: string | null;
  label: string;
  paragraphs: DeskParagraph[];
};

/**
 * The page's paragraphs grouped by section in page order (a section that appears twice, split by
 * another, gets two groups). With a `query`, only paragraphs containing it (any case) are kept.
 * Section names come from the template (`labels`), else from the key.
 */
export function groupParagraphs(
  paragraphs: DeskParagraph[],
  query = "",
  labels: Record<string, string> = {},
): ParagraphGroup[] {
  const needle = query.trim().toLowerCase();
  const groups: ParagraphGroup[] = [];
  for (const paragraph of paragraphs) {
    if (needle && !paragraph.text.toLowerCase().includes(needle)) continue;
    const last = groups.at(-1);
    if (last && last.section === paragraph.section) {
      last.paragraphs.push(paragraph);
    } else {
      groups.push({
        section: paragraph.section,
        label: paragraph.section
          ? (labels[paragraph.section] ?? sectionLabel(paragraph.section))
          : "Page",
        paragraphs: [paragraph],
      });
    }
  }
  return groups;
}

/**
 * What a redraft of these paragraphs would do (D86): the lines it writes again, and the ones kept
 * because they were edited by hand. Lines filled from the brand or product are never counted.
 */
export function redraftCounts(paragraphs: DeskParagraph[]): {
  lines: number;
  kept: number;
} {
  const open = paragraphs.filter((p) => !p.locked);
  const kept = open.filter((p) => p.edited).length;
  return { lines: open.length - kept, kept };
}

/** What a running redraft is rewriting, for the Copy tab: "the page", "Reviews", "a line". */
export function redraftLabel(
  redraft: Pick<DeskRedraft, "scope" | "section">,
  labels: Record<string, string> = {},
): string {
  switch (redraft.scope) {
    case "page":
      return "the page";
    case "section":
      return redraft.section
        ? (labels[redraft.section] ?? sectionLabel(redraft.section))
        : "a section";
    case "paragraph":
      return "a line";
    case "unwritten":
      return "the unwritten lines";
  }
}

/** Whether a running redraft is rewriting this paragraph (its row shimmers meanwhile). */
export function inRedraft(
  redraft: Pick<DeskRedraft, "scope" | "section" | "block">,
  paragraph: DeskParagraph,
): boolean {
  if (paragraph.locked) return false;
  if (redraft.scope === "paragraph") return paragraph.number === redraft.block;
  if (paragraph.edited) return false;
  if (redraft.scope === "section") return paragraph.section === redraft.section;
  return redraft.scope === "page";
}

export const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  building: "Building",
  needs_review: "Needs review",
  approved: "Approved",
  published: "Published",
  failed: "Failed",
};

type StoredWizard = {
  author_type?: string;
  ai_images?: boolean;
  image_styles?: string[];
  audience?: string | null;
  audience_gender?: string;
  audience_age?: string | null;
  emphasis?: {
    benefits?: string[];
    features?: string[];
    objections?: string[];
  };
};

/** The wizard's choices for the desk's Overview, as label and value (`builds.wizard`). */
export function wizardChoices(
  wizard: unknown,
  labels: {
    authors: readonly { id: string; label: string }[];
    styles: readonly { id: string; label: string }[];
    genders: readonly { id: string; label: string }[];
  },
): [string, string][] {
  if (!wizard || typeof wizard !== "object") return [];
  const w = wizard as StoredWizard;
  const name = (list: readonly { id: string; label: string }[], id?: string) =>
    list.find((item) => item.id === id)?.label;
  const styles = (w.image_styles ?? [])
    .map((id) => name(labels.styles, id) ?? id)
    .join(", ");
  const people = [
    name(labels.genders, w.audience_gender) ?? "Anyone",
    w.audience_age ? `aged ${w.audience_age}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const emphasis = [
    ...(w.emphasis?.benefits ?? []),
    ...(w.emphasis?.features ?? []),
    ...(w.emphasis?.objections ?? []),
  ];
  return [
    ["Author", name(labels.authors, w.author_type) ?? "Article writer"],
    ["Audience", w.audience?.split(":")[0]?.trim() || "Everyone"],
    ["People", people],
    [
      "Images",
      w.ai_images === false
        ? "product photos only"
        : styles || "AI images, any style",
    ],
    ["Emphasis", emphasis.length ? emphasis.join("; ") : "none"],
  ];
}
