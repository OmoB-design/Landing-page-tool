"use client";

import { toast } from "@/components/app/toaster";
import { BuildPreview } from "@/components/features/builds/build-preview";
import {
  DeskProvider,
  type DeskTab,
} from "@/components/features/builds/desk-context";
import { Reminders } from "@/components/features/builds/build-report";
import { DeskPanel } from "@/components/features/builds/desk-panel";
import { InksCard } from "@/components/features/builds/inks-card";
import { PublishProvider } from "@/components/features/builds/publish-context";
import {
  LiveButton,
  PublishButton,
  PublishedModal,
  Publications,
} from "@/components/features/builds/publish-controls";
import { Connections } from "@/components/features/settings/connections";
import { StatusActions } from "@/components/features/builds/status-actions";
import {
  SAMPLE_DESK_COLORS,
  SAMPLE_LIVE_URL,
} from "@/lib/builds/sample-colors";
import type { PublishingState } from "@/lib/validators/publishing";
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
  redraft: null,
  colors: SAMPLE_DESK_COLORS,
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

/** /dev/build-states: the review desk's panel (D84) with sample lines; changes only toast. With
 * `redrafting`, a redraft of Reviews is running (D86). */
export function SampleDeskPanel({
  tab,
  editing = false,
  history = false,
  redrafting = false,
}: {
  tab: DeskTab;
  editing?: boolean;
  history?: boolean;
  redrafting?: boolean;
}) {
  return (
    <DeskProvider
      buildId="sample"
      meId="me"
      initial={{
        ...SAMPLE_DESK,
        snapshots: history ? SAMPLE_SNAPSHOTS : [],
        redraft: redrafting
          ? {
              job_id: "sample",
              status: "queued",
              scope: "section",
              section: "reviews",
              block: null,
            }
          : null,
      }}
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

/** /dev/build-states: the Overview's Colours card (D86) with a sample page and brand. */
export function SampleInksCard() {
  return (
    <DeskProvider
      buildId="sample"
      meId="me"
      initial={SAMPLE_DESK}
      onChange={sampleChange}
    >
      <InksCard />
    </DeskProvider>
  );
}

/** /dev/build-states: the reminder for copy the build couldn't write, with its Redraft (D86). */
export function SampleUnwrittenReminder() {
  return (
    <DeskProvider
      buildId="sample"
      meId="me"
      initial={SAMPLE_DESK}
      onChange={sampleChange}
    >
      <Reminders
        reminders={[
          {
            title: "Some copy wasn’t rewritten.",
            detail:
              "1 of 4 parts of the copy couldn't be rewritten, so they keep the template's text. Redraft them before publishing.",
            action: "redraft-unwritten",
          },
        ]}
      />
    </DeskProvider>
  );
}

/** /dev/build-states: the toasts a redraft ends with (done, with Undo; failed, with Retry). */
export function RedraftToastButtons() {
  const link =
    "rounded-sm px-2 py-1 text-type-caption-1 font-medium text-text-link outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() =>
          toast.success("Redrafted Reviews", {
            action: { label: "Undo", onClick: () => undefined },
          })
        }
        className={link}
      >
        Done
      </button>
      <button
        type="button"
        onClick={() =>
          toast.success("Redrafted the page", {
            description:
              "Some lines couldn’t be redrafted, so they kept their words.",
            action: { label: "Undo", onClick: () => undefined },
          })
        }
        className={link}
      >
        Done, some lines kept
      </button>
      <button
        type="button"
        onClick={() =>
          toast.error(
            "Claude couldn't redraft those lines, so they're as they were. Try again.",
            { action: { label: "Retry", onClick: () => undefined } },
          )
        }
        className={link}
      >
        Failed
      </button>
    </div>
  );
}

const SAMPLE_PUBLICATION = {
  id: "pub-1",
  destination: "vercel",
  action: "publish" as const,
  status: "succeeded" as const,
  url: SAMPLE_LIVE_URL,
  created_at: "2026-10-25T09:00:00.000Z",
  created_by: "me",
  gate_overridden: true,
  override_reasons: ["placeholder_images"],
  error: null,
  page_version: 4,
  project: "lp-lum",
  seconds: 14,
};

const SAMPLE_PUBLISHING: PublishingState = {
  build_id: "sample",
  status: "approved",
  page_version: 4,
  gate: [],
  vercel_connected: true,
  live: null,
  running: null,
  job_id: null,
  publications: [],
  shopify_domain: null,
  shopify_draft: null,
};

const SAMPLE_PAGE = {
  brandId: "brand-1",
  key: "LUM-12",
  title: "Calm skin in a week",
  brand: "Lumé",
  product: "Calming serum",
  template: "Advertorial, long form",
};

/** /dev/build-states: Publish in the header (D87) in one of its states; publishing only toasts. */
export function SamplePublish({
  state,
}: {
  state:
    | "ready"
    | "gated"
    | "blocked"
    | "unconnected"
    | "running"
    | "live"
    | "live-shopify"
    | "live-draft";
}) {
  const live = state.startsWith("live");
  const draft = {
    ...SAMPLE_PUBLICATION,
    id: "pub-2",
    destination: "shopify_page",
    url: "https://lume.myshopify.com/pages/lum-12",
    admin_url: "https://admin.shopify.com/store/lume/pages/77",
    full_width: false,
    gate_overridden: false,
    override_reasons: [],
    project: null,
  };
  const publishing: PublishingState = {
    ...SAMPLE_PUBLISHING,
    vercel_connected: state !== "unconnected",
    gate:
      state === "gated"
        ? [
            {
              code: "claims",
              message: "1 claim is marked Fix in the claim check.",
              overridable: true,
            },
            {
              code: "placeholder_images",
              message:
                "The page still has placeholder images. Your testing switch allows publishing it.",
              overridable: true,
            },
          ]
        : state === "blocked"
          ? [
              {
                code: "placeholder_images",
                message: "The page still has placeholder images.",
                overridable: false,
              },
            ]
          : [],
    running:
      state === "running"
        ? { ...SAMPLE_PUBLICATION, status: "pending", url: null }
        : null,
    live: live ? SAMPLE_PUBLICATION : null,
    publications:
      state === "live-draft"
        ? [draft, SAMPLE_PUBLICATION]
        : live
          ? [SAMPLE_PUBLICATION]
          : [],
    shopify_domain: state === "live" ? null : "lume.myshopify.com",
    shopify_draft: state === "live-draft" ? draft : null,
  };
  return (
    <DeskProvider
      buildId="sample"
      meId="me"
      initial={{
        ...SAMPLE_DESK,
        build: {
          ...SAMPLE_DESK.build,
          status: live ? "published" : "approved",
        },
      }}
      onChange={sampleChange}
    >
      <PublishProvider
        buildId="sample"
        page={SAMPLE_PAGE}
        initial={publishing}
        onPublish={() => toast("Sample only: nothing was published.")}
        onUnpublish={() => toast("Sample only: nothing was unpublished.")}
      >
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2.5">
            <LiveButton />
            <PublishButton />
          </div>
          <PublishedModal />
          {live ? (
            <div className="w-80">
              <Publications />
            </div>
          ) : null}
        </div>
      </PublishProvider>
    </DeskProvider>
  );
}

/** /dev/build-states: Settings → Connections, connected or not (changes go nowhere here). */
export function SampleConnections({ connected }: { connected: boolean }) {
  return (
    <Connections
      sample={connected ? "connected" : "unconnected"}
      brands={{ "brand-1": "Lumé" }}
      initial={{
        vercel: connected
          ? {
              account: "ada",
              team_id: null,
              token_last4: "a1b2",
              connected_at: "2026-10-24T09:00:00.000Z",
              connected_by: "Ada Lovelace",
              projects: [{ brand_id: "brand-1", name: "lp-lum" }],
            }
          : null,
        shopify: connected
          ? [
              {
                brand_id: "brand-1",
                brand_name: "Lumé",
                shop_domain: "lume.myshopify.com",
                connected_at: "2026-10-26T09:00:00.000Z",
                missing_scopes: [],
              },
            ]
          : [],
        allow_placeholder_publish: connected,
        role: "owner",
      }}
    />
  );
}
