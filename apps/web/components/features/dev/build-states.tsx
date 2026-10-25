"use client";

import { toast } from "@/components/app/toaster";
import { BuildPreview } from "@/components/features/builds/build-preview";
import {
  DeskProvider,
  type DeskTab,
} from "@/components/features/builds/desk-context";
import { DeskPanel } from "@/components/features/builds/desk-panel";
import { StatusActions } from "@/components/features/builds/status-actions";
import type { DeskState } from "@/lib/validators/desk";

/** /dev/build-states: shows the toast Export raises when an export fails. */
export function ExportErrorToastButton() {
  return (
    <button
      type="button"
      onClick={() =>
        toast.error(
          "Couldn’t export the page: an image couldn’t be downloaded.",
        )
      }
      className="rounded-sm px-2 py-1 text-type-caption-1 font-medium text-text-link outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring"
    >
      Show the error toast
    </button>
  );
}

/** /dev/build-states: the preview of a build that failed on "Swap in the logo"; Retry does nothing here. */
export function SampleFailedPreview() {
  return (
    <BuildPreview
      buildId="sample"
      version="1"
      ready={false}
      failed
      failedStep="Swap in the logo"
      onRetry={() => toast("Retry would queue the build again.")}
    />
  );
}

/** The sample's paragraphs, made from its lines (a paragraph's lines share a block). */
function paragraphsOf(
  fragments: DeskState["fragments"],
): DeskState["paragraphs"] {
  const out: DeskState["paragraphs"] = [];
  for (const f of fragments) {
    const last = out.at(-1);
    if (last && last.number === f.block) {
      last.text += ` ${f.text}`;
      last.fragments.push(f.id);
      last.locked = last.locked && f.locked;
      if (f.locked) last.locked_parts.push(f.text);
    } else {
      out.push({
        number: f.block,
        kind: f.kind,
        section: f.section,
        text: f.text,
        locked: f.locked,
        locked_parts: f.locked ? [f.text] : [],
        edited: f.edited,
        fragments: [f.id],
      });
    }
  }
  return out;
}

const SAMPLE_DESK_BASE: Omit<DeskState, "paragraphs"> = {
  build: {
    id: "sample",
    status: "needs_review",
    page_version: 4,
    approved_at: null,
    approved_by: null,
  },
  fragments: [
    {
      id: "f0001",
      text: "I Swapped My Evening Cocktail for a Black Cherry Lemonade",
      section: "hero",
      locked: false,
      edited: false,
      block: 1,
      kind: "Headline",
    },
    {
      id: "f0002",
      text: "Calms redness in 7 days",
      section: "hero",
      locked: false,
      edited: false,
      block: 2,
      kind: "Paragraph",
    },
    {
      id: "f0003",
      text: "OG X Black Cherry Lemonade",
      section: "hero",
      locked: true,
      edited: false,
      block: 3,
      kind: "Text",
    },
    {
      id: "f0004",
      text: "$29.99",
      section: "hero",
      locked: true,
      edited: false,
      block: 4,
      kind: "Text",
    },
    {
      id: "f0005",
      text: "What people say",
      section: "reviews",
      locked: false,
      edited: false,
      block: 5,
      kind: "Headline",
    },
    {
      id: "f0006",
      text: "The serum my clients ask for",
      section: "reviews",
      locked: false,
      edited: true,
      block: 6,
      kind: "Paragraph",
    },
    {
      id: "f0007",
      text: "I sleep better and",
      section: "reviews",
      locked: false,
      edited: false,
      block: 7,
      kind: "Paragraph",
    },
    {
      id: "f0008",
      text: "wake up clear-headed",
      section: "reviews",
      locked: false,
      edited: false,
      block: 7,
      kind: "Paragraph",
    },
    {
      id: "f0009",
      text: "– Jess, 34",
      section: "reviews",
      locked: false,
      edited: false,
      block: 7,
      kind: "Paragraph",
    },
    {
      id: "f0010",
      text: "Questions and answers",
      section: "faq",
      locked: false,
      edited: false,
      block: 8,
      kind: "Headline",
    },
    {
      id: "f0011",
      text: "Is it gentle on sensitive skin?",
      section: "faq",
      locked: false,
      edited: false,
      block: 9,
      kind: "Question",
    },
    {
      id: "f0012",
      text: "Yes, it’s caffeine free and made with real fruit.",
      section: "faq",
      locked: false,
      edited: false,
      block: 10,
      kind: "Paragraph",
    },
  ],
  sections: { hero: "Hero", reviews: "Reviews", faq: "FAQ" },
  snapshots: [],
};

const SAMPLE_DESK: DeskState = {
  ...SAMPLE_DESK_BASE,
  paragraphs: paragraphsOf(SAMPLE_DESK_BASE.fragments),
};

const SAMPLE_SNAPSHOTS: DeskState["snapshots"] = [
  {
    seq: 3,
    reason: "Edited a line in reviews",
    created_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    created_by: "me",
  },
  {
    seq: 2,
    reason: "Restored the page from before “Edited 2 lines”",
    created_at: new Date(Date.now() - 50 * 60_000).toISOString(),
    created_by: "teammate",
  },
  {
    seq: 1,
    reason: "Edited 2 lines",
    created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    created_by: "me",
  },
];

const sampleChange = () => toast("Sample only: nothing was saved.");

/** /dev/build-states: the review desk's panel (D84) with sample lines; changes only toast. */
export function SampleDeskPanel({
  tab,
  editing = false,
  history = false,
}: {
  tab: DeskTab;
  editing?: boolean;
  history?: boolean;
}) {
  return (
    <DeskProvider
      buildId="sample"
      meId="me"
      initial={{ ...SAMPLE_DESK, snapshots: history ? SAMPLE_SNAPSHOTS : [] }}
      initialTab={tab}
      initialEditing={editing ? 2 : undefined}
      onChange={sampleChange}
    >
      <DeskPanel
        overview={
          <p className="text-type-caption-1 text-heading-05">
            (The build steps, facts, claim check and reminders.)
          </p>
        }
      />
    </DeskProvider>
  );
}

/** /dev/build-states: the header's status and Approve / Back to review (D84); changes only toast. */
export function SampleStatusActions({
  status,
  fixCount = 0,
}: {
  status: "needs_review" | "approved";
  fixCount?: number;
}) {
  return (
    <DeskProvider
      buildId="sample"
      meId="me"
      initial={{ ...SAMPLE_DESK, build: { ...SAMPLE_DESK.build, status } }}
      onChange={sampleChange}
    >
      <StatusActions fixCount={fixCount} />
    </DeskProvider>
  );
}

/** /dev/build-states: the toast a save on an outdated page raises (another tab changed it). */
export function ConflictToastButton() {
  return (
    <button
      type="button"
      onClick={() =>
        toast.error(
          "This page changed in another tab or by someone else. Reload to see the latest.",
          { action: { label: "Reload", onClick: () => undefined } },
        )
      }
      className="rounded-sm px-2 py-1 text-type-caption-1 font-medium text-text-link outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring"
    >
      Show the toast
    </button>
  );
}
