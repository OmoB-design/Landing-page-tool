"use client";

import { formatCost } from "@/components/app/row-meta";
import { Button } from "@/components/ui/button";
import { RenameIcon } from "@/components/ui/icons";
import { LocateFigmaIcon, SparkleFigmaIcon } from "@/components/ui/lp-icons";
import { LOCATE_SECTION_EVENT } from "@/lib/builds/preview-anchors";
import { formatPrice } from "@/lib/products/form";
import {
  type Reminder,
  claimAction,
  claimReason,
  findingSection,
  reportClaims,
  reportReminders,
  sectionLabel,
  sentence,
} from "@/lib/builds/report";
import { cn } from "@/lib/utils";
import type {
  BuildReport as Report,
  ComplianceFinding,
  ReportComparison,
  ReportCompetitor,
  Residue,
  ResidueFinding,
} from "@/lib/validators/build";

import { useDeskOptional } from "./desk-context";
import { CollapsibleSection, PanelSection } from "./panel-section";

/**
 * What the pipeline did and what needs attention (BUILD_SPEC §10.6; Figma Build, the right panel
 * under the steps): the facts, the copy changes, the claims check and the reminders.
 */
export function BuildReport({ report }: { report: Report }) {
  return (
    <>
      <Facts rows={reportFacts(report)} />
      <CopyChanges changes={report.copy.review} />
      {report.mode === "cloned" ? (
        <SourceLeaks residue={report.residue ?? null} />
      ) : null}
      {report.competitors ? (
        <Competitors
          competitors={report.competitors}
          comparison={report.comparison ?? null}
        />
      ) : null}
      <ClaimCheck claims={reportClaims(report)} />
      <Reminders reminders={reportReminders(report)} />
    </>
  );
}

/**
 * Competitors (B2.4a; no Figma frame yet, drawn like Source leaks): a ranking build's four
 * competitor pages. "n of 4 read" in the header; then a card per rank: the rank and the name the
 * page uses (with the real product name beside a neutral label), what was taken from the page
 * (price, rating, claims, reviews), any warning, and the page's address. A page that couldn't be
 * read shows the Fix chip and why; the ranking closed up without it.
 *
 * B2.4b (D103): each card adds "Our take" (What stands out, Worth knowing) as the page shows it,
 * and "Side by side" lists the points the table compares, a card per point with each product's
 * cell ("#1 60 days"). Every line on the page cites what it rests on; the claim check traces it.
 */
export function Competitors({
  competitors,
  comparison = null,
}: {
  competitors: ReportCompetitor[];
  comparison?: ReportComparison | null;
}) {
  const takes = new Map((comparison?.takes ?? []).map((t) => [t.rank, t]));
  const axes = comparison?.axes ?? [];
  const read = competitors.filter((c) => c.status === "pulled").length;
  return (
    <PanelSection
      title="Competitors"
      count={competitors.length > 0 ? competitors.length : undefined}
      divided
    >
      <p className="text-type-caption-1 font-medium text-heading-05">
        {read} of {competitors.length} pages read. Prices, ratings, claims and
        reviews on the page come from these pages only.
      </p>
      <ol className="flex flex-col gap-2.5">
        {competitors.map((c) => (
          <CompetitorCard
            key={c.rank}
            competitor={c}
            take={c.status === "pulled" ? takes.get(c.rank) : undefined}
          />
        ))}
      </ol>
      {axes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-type-caption-1 font-medium text-heading-02">
            Side by side
          </p>
          <ul className="flex flex-col gap-1.5">
            {axes.map((axis) => (
              <li
                key={axis.name}
                className="flex flex-col gap-1 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium"
              >
                <p className="text-heading-02">{axis.name}</p>
                {axis.cells.map((cell) => (
                  <p key={cell.rank} className="flex gap-1.5 text-heading-05">
                    <span className="w-5 shrink-0 tabular-nums">
                      #{cell.rank}
                    </span>
                    <span className="min-w-0">{cell.text}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </PanelSection>
  );
}

type Take = ReportComparison["takes"][number];

function CompetitorCard({
  competitor: c,
  take,
}: {
  competitor: ReportCompetitor;
  take?: Take;
}) {
  const failed = c.status === "failed";
  const price = formatPrice(c.price ?? null, c.currency ?? null);
  const facts = failed
    ? []
    : [
        price ?? "No price",
        c.rating != null
          ? `${c.rating} stars${c.rating_count ? ` (${c.rating_count.toLocaleString("en")})` : ""}`
          : "No rating",
        `${c.claims} ${c.claims === 1 ? "claim" : "claims"}`,
        `${c.reviews} ${c.reviews === 1 ? "review" : "reviews"}`,
      ];
  return (
    <li className="flex gap-1.5 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium">
      <span
        className={cn(
          "shrink-0 self-start rounded-lg px-1.5 text-type-caption-2 font-medium tabular-nums",
          failed ? ACTION_CLASS.Fix : "bg-foreground-03 text-heading-02",
        )}
      >
        {failed ? "Not read" : `#${c.rank}`}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-heading-02">
          {c.label}
          {c.name && c.name !== c.label ? (
            <span className="text-heading-05"> · {c.name}</span>
          ) : null}
        </p>
        {failed ? (
          <p className="text-text-danger">
            {c.error ?? "Couldn’t read this page."}
          </p>
        ) : (
          <p className="text-heading-05">{facts.join(" · ")}</p>
        )}
        {take ? (
          <div className="flex flex-col gap-1 rounded-md bg-foreground-03 px-1.5 py-1">
            {(
              [
                ["What stands out", take.stands_out.text],
                ["Worth knowing", take.worth_knowing.text],
              ] as const
            )
              .filter(([, text]) => text.trim())
              .map(([key, text]) => (
                <p key={key} className="text-heading-02">
                  <span className="text-heading-05">{key}: </span>
                  {text}
                </p>
              ))}
          </div>
        ) : null}
        {c.warnings.map((warning) => (
          <p key={warning} className="text-heading-05">
            {warning}
          </p>
        ))}
        <p className="pt-1 font-mono text-type-caption-2 break-all text-heading-05 divider-t-half">
          {c.url}
        </p>
      </div>
    </li>
  );
}

const LEAK_KIND = {
  brand: "Source name",
  images: "Image",
  links: "Link",
  claims: "Claim",
} as const;
const LEAK_COUNT = {
  brand: ["source name", "source names"],
  images: ["image", "images"],
  links: ["link", "links"],
  claims: ["inherited claim", "inherited claims"],
} as const;

// The residue scan marks a source name found in an image's alt text with this prefix.
const IMAGE_TEXT = "Image text: ";

/** The minimum leak score to publish without overriding (BUILD_SPEC §12.1, LP_RESIDUE_MIN_SCORE). */
export const LEAK_MIN = 85;

/**
 * Source leaks (B2.3; no Figma frame yet, drawn like Claim check): what's left of the cloned
 * page's source after the clone steps. The leak score in a chip (Tint-Green as Connected when it
 * passes; the Fix chip when it's under 85 or a source name is left, which blocks publishing until
 * overridden), what was found by kind, then a card per finding with the words or address and a
 * button to show its section in the preview.
 */
export function SourceLeaks({ residue }: { residue: Residue | null }) {
  if (!residue || residue.score === null) {
    return (
      <PanelSection title="Source leaks" divided>
        <p className="rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium text-heading-02">
          Not checked: this page was built before source leaks were scored.
          Rebuild it to check.
        </p>
      </PanelSection>
    );
  }
  const kinds = (Object.keys(LEAK_KIND) as (keyof typeof LEAK_KIND)[]).filter(
    (kind) => (residue.counts[kind] ?? 0) > 0,
  );
  const total = kinds.reduce(
    (sum, kind) => sum + (residue.counts[kind] ?? 0),
    0,
  );
  const passing = residue.score >= LEAK_MIN && !(residue.counts.brand ?? 0);
  return (
    <PanelSection
      title="Source leaks"
      count={total > 0 ? total : undefined}
      divided
    >
      <div className="flex items-center justify-between gap-2 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium">
        <span className="text-heading-02">Leak score</span>
        <span
          className={cn(
            "rounded-lg px-1.5 text-type-caption-2 font-medium tabular-nums",
            passing ? "bg-tint-green text-text-success" : ACTION_CLASS.Fix,
          )}
        >
          {residue.score} / 100
        </span>
      </div>
      {total === 0 ? (
        <p className="rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium text-heading-02">
          Nothing of the source page is left
        </p>
      ) : (
        <>
          <p className="text-type-caption-1 font-medium text-heading-05">
            {kinds
              .map((kind) => {
                const count = residue.counts[kind] ?? 0;
                return `${count} ${LEAK_COUNT[kind][count === 1 ? 0 : 1]}`;
              })
              .join(", ")}
            {passing ? "" : ". Publishing asks you to confirm."}
          </p>
          <ul className="flex flex-col gap-2.5">
            {residue.findings.map((finding, index) => (
              <Leak key={`${finding.kind}-${index}`} finding={finding} />
            ))}
          </ul>
        </>
      )}
    </PanelSection>
  );
}

function Leak({ finding }: { finding: ResidueFinding }) {
  const section = findingSection(finding.where);
  const address = finding.kind === "images" || finding.kind === "links";
  return (
    <li className="flex gap-1.5 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium">
      <span
        className={cn(
          "shrink-0 self-start rounded-lg px-1.5 text-type-caption-2 font-medium",
          finding.kind === "claims" ? ACTION_CLASS.Check : ACTION_CLASS.Fix,
        )}
      >
        {LEAK_KIND[finding.kind]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p
          className={cn(
            "text-heading-05",
            address && "font-mono text-type-caption-2 break-all",
          )}
        >
          {address
            ? finding.text
            : finding.text.startsWith(IMAGE_TEXT)
              ? `In an image’s text: “${finding.text.slice(IMAGE_TEXT.length)}”`
              : `“${finding.text}”`}
        </p>
        {section ? (
          <div className="flex justify-end pt-1 divider-t-half">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent(LOCATE_SECTION_EVENT, { detail: section }),
                )
              }
              aria-label={`Show in the preview: ${sectionLabel(section)}`}
              className={CLAIM_BUTTON}
            >
              <LocateFigmaIcon className="shrink-0 text-icon-system" />
              {sectionLabel(section)}
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Copy changes (Figma Build, Copy changes): 10 px down (in the panel's 10 px stack), folding, open
 * at first; each rewritten line
 * on Foreground-01, the old one struck through in Heading-05 over the new one in Heading-02.
 */
export function CopyChanges({
  changes,
}: {
  changes: Report["copy"]["review"];
}) {
  if (changes.length === 0) return null;
  return (
    <div className="pt-2.5">
      {/* Closed until asked for (owner, 2026-11-05): the list can be long. */}
      <CollapsibleSection title={`Copy changes (${changes.length})`}>
        <ol className="flex flex-col gap-1">
          {changes.map((change, index) => (
            <li
              key={index}
              className="flex flex-col gap-1.5 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium"
            >
              <del className="text-heading-05">{change.original}</del>
              <ins className="pt-1.5 text-heading-02 no-underline divider-t-half">
                {change.replacement || "(removed)"}
              </ins>
            </li>
          ))}
        </ol>
      </CollapsibleSection>
    </div>
  );
}

/** Claim check (Figma Build, Claim check): the count, then a card per claim, or "No claims flagged". */
export function ClaimCheck({ claims }: { claims: ComplianceFinding[] }) {
  return (
    <PanelSection
      title="Claim check"
      count={claims.length > 0 ? claims.length : undefined}
      divided
    >
      {claims.length === 0 ? (
        <p className="rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium text-heading-02">
          No claims flagged
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {claims.map((finding) => (
            <Claim
              key={`${finding.rule}-${finding.location}-${finding.text}`}
              finding={finding}
            />
          ))}
        </ul>
      )}
    </PanelSection>
  );
}

/**
 * Reminders (Figma Review desk/Overview, Reminders): each a Foreground-01 card with its title on
 * Foreground-03
 * (Heading-02) and the detail under it in Heading-05.
 */
export function Reminders({ reminders }: { reminders: Reminder[] }) {
  if (reminders.length === 0) return null;
  return (
    <PanelSection title="Reminders">
      <ul className="flex flex-col gap-2.5">
        {reminders.map((reminder) => (
          <li
            key={reminder.title}
            className="flex flex-col gap-1.5 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium"
          >
            <span className="rounded-sm bg-foreground-03 px-1.5 py-1 text-heading-02">
              {reminder.title}
            </span>
            {reminder.detail ? (
              <span className="text-heading-05">{reminder.detail}</span>
            ) : null}
            {reminder.action === "redraft-unwritten" ? (
              <RedraftUnwritten />
            ) : null}
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}

/** "Redraft those lines" on the copy-error reminder (D86): only on the review desk. */
function RedraftUnwritten() {
  const desk = useDeskOptional();
  if (!desk) return null;
  const busy = desk.pending !== null || desk.redrafting !== null;
  return (
    <Button
      type="button"
      variant="outline"
      size="compact"
      disabled={busy}
      onClick={() => void desk.redraft({ scope: "unwritten" })}
      className="self-start"
    >
      <SparkleFigmaIcon className="size-3 text-icon-system" />
      Redraft those lines
    </Button>
  );
}

/** The report's facts, as the frame lists them, values in sentence case. */
function reportFacts(report: Report): [string, string][] {
  const { images, copy, brand, layout } = report;
  const sections =
    [
      layout.removed.length ? `removed ${layout.removed.join(", ")}` : "",
      layout.duplicated.length ? `added ${layout.duplicated.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ") || "in the template's order";
  return [
    ["Template", report.template.name],
    [
      "Copy",
      copy.skipped
        ? "not rewritten"
        : `${copy.rewritten} of ${copy.eligible} lines rewritten`,
    ],
    ["Sections", sections],
    [
      "Colours",
      brand.recolor
        ? `${brand.recolor.exact} exact, ${brand.recolor.hue_shifted} shifted`
        : "not applied",
    ],
    ["Fonts", brand.recolor?.fonts.join(", ") || "the template's"],
    [
      "Logo",
      brand.logos
        ? brand.logos.logos_missing
          ? "missing: the brand name stands in"
          : "the brand's logo"
        : "none",
    ],
    [
      "Images",
      `${images.product_photos} product ${images.product_photos === 1 ? "photo" : "photos"}, ${images.mock_images} placeholder`,
    ],
    [
      "Removed terms",
      copy.purged_terms.map((t) => t.term).join(", ") || "none",
    ],
    ["Cost", formatCost(report.cost.total_usd)],
  ];
}

/**
 * The facts (Figma Build, under Details): 16 px down, rows 4 px apart on Foreground-01 with 8 px
 * corners, 6 px in; the label (with its colon) in Heading-02 and the value to the right in
 * Heading-05, both 12 px medium.
 */
function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="flex flex-col gap-1 pt-2.5">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium"
        >
          <dt className="shrink-0 text-heading-02">{label}:</dt>
          <dd className="min-w-0 text-right text-heading-05">
            {sentence(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A claim card's button (Figma Build, Claim check: 22 px, Surface-Primary, 1 px Stroke-Strong,
 * Shadow/Panel). */
const CLAIM_BUTTON =
  "flex h-5.5 items-center gap-1 rounded-sm border border-stroke-strong bg-surface-primary px-1.5 text-type-caption-1 font-medium text-heading-01 shadow-panel transition-transform duration-150 ease-out outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring active:scale-97";

const ACTION_CLASS = {
  Fix: "bg-highlight-red-50 text-text-danger",
  Check: "bg-highlight-yellow-150 text-highlight-yellow-500",
} as const;

/**
 * A flagged claim (Figma Build, Claim check): a Foreground-01 card, 8 px corners, 6 px in. "Fix"
 * (Highlight-Red-50 / Text-Danger) or "Check" (Highlight-Yellow-150 / Highlight-Yellow-500) in
 * an 11 px chip, then the quoted line in Heading-05, the reason on Foreground-03 in Heading-02 (Review desk/Overview), and
 * under a 0.5 px line the section's button (22 px, Surface-Primary, 1 px Stroke-Strong, Shadow/Panel,
 * the locate icon and the section's name) that shows the line in the preview.
 */
function Claim({ finding }: { finding: ComplianceFinding }) {
  const action = claimAction(finding);
  const section = findingSection(finding.location);
  // On the review desk (D84), a claim in page text outlines its own sentence and can be edited.
  const desk = useDeskOptional();
  const block =
    desk && finding.fragment
      ? desk.blockOf({ fragment: finding.fragment })
      : null;
  const sentence = block
    ? desk?.desk.paragraphs.find((p) => p.number === block)
    : undefined;
  return (
    <li className="flex gap-1.5 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium">
      <span
        className={cn(
          "shrink-0 self-start rounded-lg px-1.5 text-type-caption-2 font-medium",
          ACTION_CLASS[action],
        )}
      >
        {action}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-heading-05">“{finding.text}”</p>
        <p className="rounded-md bg-foreground-03 px-1.5 py-1 text-heading-02">
          {claimReason(finding.reason)}
        </p>
        {section || sentence ? (
          <div className="flex justify-end gap-1.5 pt-1 divider-t-half">
            {sentence && !sentence.locked ? (
              <button
                type="button"
                onClick={() => desk?.open({ block: sentence.number })}
                aria-label={`Edit the line: ${sentence.text}`}
                className={CLAIM_BUTTON}
              >
                <RenameIcon className="size-3 shrink-0 text-icon-system" />
                Edit line
              </button>
            ) : null}
            {section ? (
              <button
                type="button"
                onClick={() =>
                  sentence
                    ? desk?.show({ block: sentence.number })
                    : window.dispatchEvent(
                        new CustomEvent(LOCATE_SECTION_EVENT, {
                          detail: section,
                        }),
                      )
                }
                aria-label={`Show in the preview: ${sectionLabel(section)}`}
                className={CLAIM_BUTTON}
              >
                <LocateFigmaIcon className="shrink-0 text-icon-system" />
                {sectionLabel(section)}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
