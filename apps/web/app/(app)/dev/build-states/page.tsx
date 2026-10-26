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
  ConflictToastButton,
  ExportErrorToastButton,
  RedraftToastButtons,
  SampleDeskPanel,
  SampleFailedPreview,
  SampleInksCard,
  SampleConnections,
  SamplePublish,
  SampleStatusActions,
  SampleUnwrittenReminder,
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
          title="The page’s status and Approve"
          when="Every page has a status: Building (queued or building), Needs review (finished), Approved, Published or Failed. Pages groups by it. B1.4a (the review desk, D84) puts it back in the header with Approve; B1.5 adds Publish (Approved → Published, after the publish check)."
          shows={[
            "Designed (Figma Review desk — editing copy): Approve (the blue button), then the status chip (the glyph alone on a phone), a rule, Export, a rule.",
            "Needs review: Approve. With claims marked Fix it asks first (“Approve anyway”); publishing is where they block.",
            "Approved: Back to review (outline). Any change to the page sends it back to Needs review on its own.",
          ]}
          design={[
            "Done: the status chip, Approve and Back to review",
            "Still to draw: the Fix warning, and Publish when B1.5 arrives",
          ]}
        >
          <div className="flex flex-col gap-6">
            <Labeled label="Needs review">
              <div className="flex gap-6">
                <SampleStatusActions status="needs_review" />
                <SampleStatusActions status="needs_review" fixCount={1} />
              </div>
            </Labeled>
            <Labeled label="Approved">
              <SampleStatusActions status="approved" />
            </Labeled>
            <Labeled label="Every status (Pages)">
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

        <State
          number={9}
          title="Editing the copy"
          when="On a finished page, the panel’s Copy tab lists every line of the page by section. A click on a line, in the panel or on the page in the preview, opens it; a claim’s Edit line opens its line too."
          shows={[
            "Designed (Figma Review desk — editing copy): the tab bar, the search and its hint, then each section as a folding block between hairlines (the first open; the others open when clicked, when a line in them is clicked on the page, or when a search matches).",
            "A paragraph split by a link or bold text stays one card; each piece is edited on its own (so the bold and the link survive).",
            "Lines at rest, hover, outlined (shown in the preview), edited and locked (names and prices from the brand or product).",
            "An open line: a field with Cancel and Save (⌘ Enter saves, Esc cancels). Saving snapshots the page first, checks the claims again and reloads the preview; the line stays outlined on the page.",
          ]}
          design={[
            "Done: the tabs, sections, line states and the open line",
            "The paragraph card (a split paragraph) follows the line’s look until it’s drawn",
            "Typing on the page itself arrives with the M3 editor",
          ]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <Labeled label="At rest">
              <PanelFrame>
                <SampleDeskPanel tab="copy" />
              </PanelFrame>
            </Labeled>
            <Labeled label="A line open">
              <PanelFrame>
                <SampleDeskPanel tab="copy" editing />
              </PanelFrame>
            </Labeled>
          </div>
        </State>

        <State
          number={10}
          title="History and undo"
          when="Every change (an edit, a recolour, a redraft, a restore) saves the page first. The History tab lists them, newest first; the last 12 are kept."
          shows={[
            "Undo, naming the last change, puts back the page before it.",
            "Each change with when and who; Restore makes the page before it current again (itself a change you can undo).",
            "With no changes: a line saying each change will be saved here.",
          ]}
          design={[
            "Done: Undo and the list of changes (Figma Review desk — editing copy)",
            "Still to draw: the empty History",
          ]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <Labeled label="With changes">
              <PanelFrame>
                <SampleDeskPanel tab="history" history />
              </PanelFrame>
            </Labeled>
            <Labeled label="No changes yet">
              <PanelFrame>
                <SampleDeskPanel tab="history" />
              </PanelFrame>
            </Labeled>
          </div>
        </State>

        <State
          number={11}
          title="Changed in another tab"
          when="Someone saves a change to the page (in another tab, or a teammate) after this tab opened it. Every change carries the page version it was made on, so this tab’s next change is refused instead of overwriting theirs."
          shows={[
            "An error toast: “This page changed in another tab or by someone else. Reload to see the latest.” with Reload.",
            "Reload brings in the latest page and its lines; nothing of theirs is lost.",
          ]}
          design={["How the clash is told, and the way to catch up"]}
        >
          <ConflictToastButton />
        </State>

        <State
          number={12}
          title="Redraft: asking first"
          when="On a finished page: the sparkle beside the Copy tab’s search redrafts the whole page, the one on a section’s heading redrafts that section, and the one in an open line’s editor rewrites that line. Claude writes new words for the lines, in the brand’s voice (a background job, a few cents)."
          shows={[
            "A small card under the button: what it rewrites (“Claude writes new words for 6 lines”), which lines stay (the ones you edited by hand), and that it can be undone.",
            "An optional note for the new words (“shorter, more playful”), then Cancel or Redraft (Rewrite for one line).",
            "Bold words, links, prices and names filled from the brand or product always stay as they are.",
          ]}
          design={[
            "The sparkle buttons (page, section, line) and the asking card",
            "Click a sparkle in the panel to open the card",
          ]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <Labeled label="Copy tab (click a sparkle)">
              <PanelFrame>
                <SampleDeskPanel tab="copy" />
              </PanelFrame>
            </Labeled>
            <Labeled label="A line open (its sparkle rewrites it)">
              <PanelFrame>
                <SampleDeskPanel tab="copy" editing />
              </PanelFrame>
            </Labeled>
          </div>
        </State>

        <State
          number={13}
          title="Redrafting"
          when="While a redraft runs (seconds to a minute). Other changes to the page wait until it’s done: lines don’t open, Undo, Restore, Approve and Recolour are paused."
          shows={[
            "A status card at the top of the Copy tab: what’s being redrafted, its latest step (“Writing 6 lines”), and that changes wait.",
            "The lines being rewritten shimmer.",
            "When it ends, a toast: done (with Undo), done with some lines kept, or failed (with Retry). The preview reloads with the new words.",
          ]}
          design={[
            "The status card and the shimmering lines",
            "The three toasts",
          ]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <Labeled label="Redrafting Reviews">
              <PanelFrame>
                <SampleDeskPanel tab="copy" redrafting />
              </PanelFrame>
            </Labeled>
            <Labeled label="When it ends">
              <RedraftToastButtons />
            </Labeled>
          </div>
        </State>

        <State
          number={14}
          title="Colours"
          when="On a finished page, in the Overview tab before Your choices: the page’s four colours, and the colours to recolour it to (the brand’s, at first)."
          shows={[
            "On the page: primary, dark, tint and accent as swatches.",
            "Recolour to: four colour pickers. Changing the primary works out a new dark and tint, as the brand form does.",
            "Brand colours (when you’ve picked others) and Recolour page. Recolouring is a change you can undo; text on brand colours turns black or white to stay readable.",
          ]}
          design={["The Colours card", "Recoloured: the toast with Undo"]}
        >
          <PanelFrame>
            <SampleInksCard />
          </PanelFrame>
        </State>

        <State
          number={15}
          title="Copy partly rewritten"
          when="When the build’s copy pass couldn’t write some lines (Claude failed three times), they keep the template’s words and publishing is blocked."
          shows={[
            "A reminder in the Overview saying so, with Redraft those lines.",
            "Redrafting them clears the reminder and the block.",
          ]}
          design={["The reminder with its button"]}
        >
          <PanelFrame>
            <SampleUnwrittenReminder />
          </PanelFrame>
        </State>

        <State
          number={16}
          title="Publish: asking first"
          when="On an approved (or published) page, Publish sits after Approve in the header. A card asks first: where the page goes (the brand’s Vercel project), then anything that blocks it."
          shows={[
            "Ready: a line saying the page goes live at its own address, then Cancel / Publish.",
            "Blocked by reasons that can be passed (claims marked Fix, copy in the template’s words, placeholder images with the testing switch on): each listed, and “Publish anyway”, recorded with your name.",
            "Blocked by placeholder images with the testing switch off: Publish stays off, with where to allow it.",
            "Vercel not connected: a link to Settings.",
          ]}
          design={["The Publish button and the asking card in its four states"]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <Labeled label="Ready">
              <SamplePublish state="ready" />
            </Labeled>
            <Labeled label="Reasons to pass">
              <SamplePublish state="gated" />
            </Labeled>
            <Labeled label="Blocked">
              <SamplePublish state="blocked" />
            </Labeled>
            <Labeled label="Vercel not connected">
              <SamplePublish state="unconnected" />
            </Labeled>
          </div>
        </State>

        <State
          number={17}
          title="Publishing"
          when="While the page is being published (packing it, setting up the brand’s project, uploading, Vercel deploying, checking the address opens): usually under a minute."
          shows={[
            "The button turns to “Publishing…” with a spinner; hovering it shows the current step.",
            "If it fails, an error toast says why (for example, Vercel refused the token).",
          ]}
          design={["The publishing button", "The failure toast"]}
        >
          <SamplePublish state="running" />
        </State>

        <State
          number={18}
          title="Published"
          when="When Vercel says the page is ready and its address opens, a modal opens by itself (and again from Live in the header)."
          shows={[
            "A success header: Your page is live, when, by whom and how fast (or that the live page is an older version).",
            "The live page itself in a browser frame with a Desktop / Phone switch; it scrolls (scripts stay off).",
            "The address with Copy.",
            "Where it’s published: Vercel (Live, the project, Unpublish, which asks first and then takes the page down while the brand’s other pages stay up) and Shopify (not connected: Connect Shopify opens the connect modal for this brand; connected: Publish to Shopify, which asks first when there are reasons to pass; publishing: a spinner; a draft: Open in admin and Update draft).",
            "The page’s details on one line; Done and Open page.",
            "The Overview lists every publish and unpublish.",
          ]}
          design={[
            "The published modal (the owner’s Figma frame 635:15084; dark crafted to match)",
            "Unpublish’s question and the Unpublishing state",
            "Live in the header; the Published list",
          ]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <Labeled label="Shopify not connected">
              <SamplePublish state="live" />
            </Labeled>
            <Labeled label="Shopify connected">
              <SamplePublish state="live-shopify" />
            </Labeled>
            <Labeled label="A Shopify draft">
              <SamplePublish state="live-draft" />
            </Labeled>
          </div>
        </State>

        <State
          number={19}
          title="Settings: Connections"
          when="Settings has its own sidebar (Back to app; Personal, Workspace and Tools, as Quality arranges its settings; settings not built yet show Soon). Connections lists the services pages are published to; the testing switch is in General."
          shows={[
            "Cards two to a row (logo tile, name, Connected or Soon, two lines, a small button), the connected ones first.",
            "Connect opens a modal: the Vercel mark, Connect Vercel and what it does, the access token (with where to make one) and an optional team id; Cancel and Connect, the error in the footer if Vercel refuses the token.",
            "View connection opens Vercel’s page: connected on, account, connected by, Replace token and Disconnect, and the brand projects with Open.",
          ]}
          design={[
            "The settings sidebar",
            "The Connections cards, the connect modal and the connection page",
          ]}
        >
          <div className="flex flex-wrap items-start gap-6">
            <Labeled label="Not connected (Connect opens the modal)">
              <div className="w-xl">
                <SampleConnections connected={false} />
              </div>
            </Labeled>
            <Labeled label="Connected (View connection opens its page)">
              <div className="w-xl">
                <SampleConnections connected />
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
