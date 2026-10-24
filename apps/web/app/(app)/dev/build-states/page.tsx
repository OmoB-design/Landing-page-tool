import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { StatusGlyph } from "@/components/app/status-glyph";
import { BuildPreview } from "@/components/features/builds/build-preview";
import {
  CopyChanges,
  Reminders,
} from "@/components/features/builds/build-report";
import {
  type BuildStep,
  BuildStepsCard,
} from "@/components/features/builds/build-steps";
import { BuildWorkspace } from "@/components/features/builds/build-workspace";
import { ExportButtonView } from "@/components/features/builds/export-button";
import {
  ExportErrorToastButton,
  SampleFailedPreview,
} from "@/components/features/dev/build-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertIcon } from "@/components/ui/icons";
import { getSessionContext } from "@/lib/auth/session";
import { OWNED_BUILD_STEPS } from "@/lib/builds/steps";
import { STATUS_GROUPS } from "@/lib/pages/list";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Build page states" };

/** A build that failed on its fourth step. */
const FAILED_STEPS: BuildStep[] = OWNED_BUILD_STEPS.map((step, index) => ({
  ...step,
  state: index < 3 ? "done" : index === 3 ? "failed" : "idle",
  note: index === 3 ? "The brand’s logo couldn’t be downloaded." : undefined,
}));

/** Every kind of reminder at once. */
const ALL_REMINDERS = [
  {
    title: "Placeholder images.",
    detail:
      "Scenes and people are placeholders, so this page can’t be published. Real images arrive in B1.3.",
  },
  {
    title: "Some copy wasn’t rewritten.",
    detail: "The copywriter stopped after 2 of 5 parts: the request timed out.",
  },
  {
    title: "Copy written in mock mode.",
    detail:
      "Lines are marked [mock] instead of being rewritten, at no cost. Real copy needs mock mode off.",
  },
  {
    title: "Written as an expert.",
    detail:
      "The byline is a fictional expert's voice: check the page never claims real credentials.",
  },
  { title: "Two images were smaller than their slots and were stretched." },
];

const SAMPLE_CHANGES = [
  {
    original: "Verified Lowest Price of the Year. Shop Now!",
    replacement: "OG X Black Cherry Lemonade by BRĒZ. Experience now",
  },
  {
    original:
      "I Went From Settling for Fast-Fashion Bags to Carrying One That Gets Better Every Year",
    replacement:
      "I Swapped My Evening Cocktail for a Black Cherry Lemonade With No Regrets",
  },
  {
    original:
      "I expected finding a bag worth keeping to mean spending hundreds on a designer name.",
    replacement:
      "I figured a fun night meant a big bar tab and a slow morning. Some nights, that tab could reach",
  },
];
/** A list the length of a real build's (40 of its usual 100–150 lines). */
const LONG_CHANGES = Array.from({ length: 40 }, (_, index) => ({
  ...SAMPLE_CHANGES[index % SAMPLE_CHANGES.length]!,
  where: "hero",
}));

/**
 * /dev/build-states (development only): the build page's states that the Figma Build frames don't
 * draw, each with what triggers it, what it shows today and what a design would need to cover. The
 * pieces are the real components with sample data.
 */
export default function BuildStatesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <>
      <PageHeader title="Build page states" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-16 px-6 pt-12 pb-40">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
            Build page states
          </h1>
          <p className="max-w-175 text-type-body-small leading-5 font-medium text-sub-text">
            What the build page shows in the moments the Figma frames don’t
            draw. Each one says what makes it appear, what it shows today (my
            stand-in) and what a design would need to cover. The pieces below
            are the real components with sample data.
          </p>
        </div>

        <State
          number={1}
          title="A build that failed"
          when="A step can’t finish: the template, brand or product can’t be loaded, an image or the logo can’t be downloaded, or the copywriter fails after its retries. The page’s status becomes Failed (it moves to the Failed group on Pages)."
          shows={[
            "The steps before it stay finished (blue).",
            "The failed step keeps its card; its loader stops in red, and the reason shows in red under its name.",
            "The steps after it stay at rest, and the chip shows how far it got (3/13).",
            "Designed (Build/Fail): the well shows a dashed card, “This build failed.” and the step that failed; Retry build sits beside Open in new tab (disabled).",
            "Retry build queues the build again; it picks up after the last step that finished, so only the rest runs (and costs) again.",
            "Export is unavailable (greyed, with a tooltip).",
          ]}
          design={[
            "The failed step and how the reason reads",
            "The preview well’s message",
            "A way to try again (“Build again”), which doesn’t exist yet",
          ]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <PanelFrame>
              <BuildStepsCard steps={FAILED_STEPS} done={3} />
            </PanelFrame>
            <PreviewFrame>
              <SampleFailedPreview />
            </PreviewFrame>
          </div>
        </State>

        <State
          number={2}
          title="The preview while the page builds"
          when="From the moment a build is queued until its last step finishes (about 20 seconds to 2 minutes). Then the page refreshes itself and the built page appears in the well."
          shows={[
            "Designed (the preview while the page builds): Hairline’s terminal figure playing in a dashed frame over “The preview appears when the build finishes.”",
            "Open in new tab is shown, disabled, until there is a page.",
          ]}
          design={[
            "The empty well while building: text, an illustration, or a skeleton of a page",
            "Whether “Open in new tab” shows (disabled) or hides",
          ]}
        >
          <PreviewFrame>
            <BuildPreview buildId="sample" version="1" ready={false} />
          </PreviewFrame>
        </State>

        <State
          number={3}
          title="Exporting"
          when="Clicking Export in the header on a finished page. It runs an export (images and fonts put inside one file, then saved), which takes a few seconds; then the browser downloads <KEY>.html. If the export fails, a toast says why."
          shows={[
            "Ready: the button as drawn.",
            "Before the page exists: greyed out; hovering says “Available when the build finishes”.",
            "Exporting: a spinner in place of the icon and “Exporting…”, not clickable.",
            "Failed: a red toast at the bottom with the reason.",
            "Done: nothing on the page; the file appears in the browser’s downloads.",
          ]}
          design={[
            "The exporting state of the button",
            "A “done” moment (e.g. a tick, or “Downloaded”), if you want one",
            "The error toast (toasts are still the stock style)",
          ]}
        >
          <div className="flex flex-wrap items-center gap-8">
            <Labeled label="Ready">
              <ExportButtonView ready busy={false} />
            </Labeled>
            <Labeled label="Before the page exists">
              <ExportButtonView ready={false} busy={false} />
            </Labeled>
            <Labeled label="Exporting">
              <ExportButtonView ready busy />
            </Labeled>
            <Labeled label="Failed">
              <ExportErrorToastButton />
            </Labeled>
          </div>
        </State>

        <State
          number={4}
          title="Warnings, now under Reminders"
          when="Each reminder has its own trigger: placeholder images (images in mock mode, until real images in B1.3; these block publishing), part of the copy failing to rewrite, the copy step being skipped (it says why), copy written in mock mode (no AI, no cost), an Expert byline chosen in the wizard, and any other note the pipeline leaves (title only)."
          shows={[
            "Today: each as a Reminders card, title on Foreground-02 and the detail under it.",
            "Before the redesign: coloured banners at the top of the panel, red for blocking (placeholder images, failed copy) and yellow for notes (mock copy).",
          ]}
          design={[
            "Whether blocking ones (placeholder images, failed copy) look different from notes, or move back to the top",
            "Reminders with a title only",
          ]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <Labeled label="Now">
              <PanelFrame>
                <Reminders reminders={ALL_REMINDERS} />
              </PanelFrame>
            </Labeled>
            <Labeled label="Before (the old banners)">
              <div className="flex w-panel flex-col gap-2">
                <OldBanner tone="danger" title="Placeholder images">
                  Scenes and people are placeholders, so this page can&apos;t be
                  published. Real images arrive in B1.3.
                </OldBanner>
                <OldBanner tone="warning" title="Copy written in mock mode">
                  Lines are marked [mock] instead of being rewritten, at no
                  cost. Real copy needs mock mode off.
                </OldBanner>
              </div>
            </Labeled>
          </div>
        </State>

        <State
          number={5}
          title="A long list of copy changes"
          when="Every line the copywriter rewrites is listed. A typical build rewrites 100 to 150 lines, so the list runs for thousands of pixels and the panel scrolls a long way before Claim check and Reminders."
          shows={[
            "Every change, open by default (below: 40 of them in a panel-sized frame; scroll it).",
            "Folding the section hides them all.",
          ]}
          design={[
            "A cap with “Show all 132”, folded by default, search, or grouping by section (each change knows its section)",
          ]}
        >
          <PanelFrame className="h-120 overflow-y-auto">
            <CopyChanges changes={LONG_CHANGES} />
          </PanelFrame>
        </State>

        <State
          number={6}
          title="The Mover, hovered and dragged"
          when="The handle on the right panel’s left edge, centred in the view. Try it on the frame below."
          shows={[
            "Hover: the pointer turns into ↔ and the pill stretches about 10 % taller.",
            "Drag left or right: the panel widens up to 640 px (the preview keeps at least 400 px) or narrows back to 320 px.",
            "Keyboard (Tab to it): a focus ring; arrow keys move it 16 px, Home / End go narrowest / widest, Enter resets.",
            "Double click: back to 320 px. The width is remembered in this browser.",
          ]}
          design={[
            "Hover, pressed (dragging) and focused looks for the pill",
            "Whether it shows anything while dragging (e.g. the width)",
          ]}
        >
          <div className="flex h-90 flex-col overflow-hidden rounded-lg edge">
            <BuildWorkspace
              preview={
                <div className="flex flex-1 items-center justify-center bg-foreground-02 text-type-caption-1 font-medium text-heading-05">
                  The preview
                </div>
              }
              panel={
                <p className="text-type-caption-1 font-medium text-heading-05">
                  The right panel. Drag the handle on its left edge.
                </p>
              }
            />
          </div>
        </State>

        <State
          number={7}
          title="Phone-width screens"
          when="A window narrower than 1024 px (tablets and phones)."
          shows={[
            "The sidebar hides; the header’s button opens it.",
            "The preview stacks above the panel at full width and the height of the screen; the panel follows below. The Mover is hidden.",
          ]}
          design={["The build page at phone width (390 px)"]}
        >
          <Suspense
            fallback={
              <p className="text-type-caption-1 font-medium text-heading-05">
                Finding your latest page…
              </p>
            }
          >
            <PhoneWidth />
          </Suspense>
        </State>

        <State
          number={8}
          title="The page’s status"
          when="Every page has a status: Building (queued or building), Needs review (finished), Approved, Published or Failed. Pages groups by it. The next build (B1.4, the review desk) adds Approve (Needs review → Approved) and B1.5 adds Publish (Approved → Published, after the publish check)."
          shows={[
            "Before the redesign: the status sat at the right of the header, its glyph and name (below).",
            "Now: not on the build page (the frames dropped it); only on Pages.",
          ]}
          design={[
            "Where the status sits on the build page",
            "Approve and Publish actions (and going back to review)",
          ]}
        >
          <div className="flex flex-col gap-6">
            <Labeled label="Before (the old header)">
              <div className="overflow-hidden rounded-lg bg-surface-primary edge">
                <PageHeader
                  title="BRE-1 · Advertorial: 30-day wear test · OG X Black Cherry Lemonade"
                  actions={
                    <span className="flex items-center gap-1.5 text-type-caption-1 text-sub-text">
                      <StatusGlyph status="needs_review" />
                      Needs review
                    </span>
                  }
                />
              </div>
            </Labeled>
            <Labeled label="Every status">
              <div className="flex flex-wrap gap-6">
                {STATUS_GROUPS.map((group) => (
                  <span
                    key={group.id}
                    className="flex items-center gap-1.5 text-type-caption-1 text-sub-text"
                  >
                    <StatusGlyph status={group.id} />
                    {group.label}
                  </span>
                ))}
              </div>
            </Labeled>
          </div>
        </State>
      </div>
    </>
  );
}

/** The org's newest page in a 390 × 844 frame, which renders it at phone width. */
async function PhoneWidth() {
  const { currentOrg } = await getSessionContext();
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("builds")
    .select("id, key")
    .eq("org_id", currentOrg.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) {
    return (
      <p className="text-type-caption-1 font-medium text-heading-05">
        No pages yet: build one, then come back here to see it at phone width.
      </p>
    );
  }
  return (
    <Labeled label={`${latest.key} at 390 × 844`}>
      <iframe
        src={`/pages/${latest.id}`}
        title={`${latest.key} at phone width`}
        className="h-211 w-97.5 rounded-lg bg-surface-primary edge"
      />
    </Labeled>
  );
}

function State({
  number,
  title,
  when,
  shows,
  design,
  children,
}: {
  number: number;
  title: string;
  when: string;
  shows: string[];
  design: string[];
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6 pt-10 divider-t-strong">
      <h2 className="flex items-baseline gap-3 text-type-h6 font-medium text-heading-01">
        <span className="text-type-body-small text-heading-06 tabular-nums">
          {number}
        </span>
        {title}
      </h2>
      <div className="grid gap-6 text-type-body-small leading-5 lg:grid-cols-3">
        <Notes heading="When it shows">
          <p className="text-heading-03">{when}</p>
        </Notes>
        <Notes heading="What it shows today">
          <List items={shows} />
        </Notes>
        <Notes heading="For your design">
          <List items={design} />
        </Notes>
      </div>
      {children}
    </section>
  );
}

function Notes({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-type-caption-1 font-medium text-heading-05">
        {heading}
      </h3>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-4 text-heading-03">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-type-caption-1 font-medium text-heading-05">
        {label}
      </span>
      {children}
    </div>
  );
}

/** The right panel's frame at its resting width (320 px), as on the build page. */
function PanelFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-panel shrink-0 flex-col gap-2.5 rounded-lg bg-surface-primary px-4 pt-6 pb-3 edge",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The preview column on its Foreground-01 ground, at a fixed height. */
function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-160 min-w-0 flex-1 basis-120 flex-col gap-2.5 rounded-lg bg-foreground-01 px-6 pt-6 edge">
      {children}
    </div>
  );
}

/** The panel's banners before the redesign (D82 moved them under Reminders). */
function OldBanner({
  tone,
  title,
  children,
}: {
  tone: "danger" | "warning";
  title: string;
  children: ReactNode;
}) {
  return (
    <Alert
      className={
        tone === "danger"
          ? "border-spot-500-red/30 bg-highlight-red-50"
          : "border-spot-500-yellow/30 bg-highlight-yellow-50"
      }
    >
      <AlertIcon
        aria-hidden
        className={tone === "danger" ? "text-text-danger" : "text-text-warning"}
      />
      <AlertTitle className="text-body">{title}</AlertTitle>
      <AlertDescription className="text-sub-text">{children}</AlertDescription>
    </Alert>
  );
}
