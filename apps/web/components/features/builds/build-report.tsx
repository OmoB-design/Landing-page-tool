"use client";

import { formatCost } from "@/components/app/row-meta";
import { LocateFigmaIcon } from "@/components/ui/lp-icons";
import { LOCATE_SECTION_EVENT } from "@/lib/builds/preview-anchors";
import {
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
} from "@/lib/validators/build";

import { CollapsibleSection, PanelSection } from "./panel-section";

/**
 * What the pipeline did and what needs attention (BUILD_SPEC §10.6; Figma Build, the right panel
 * under the steps): the facts, the copy changes, the claims check and the reminders.
 */
export function BuildReport({ report }: { report: Report }) {
  const { copy } = report;
  const claims = reportClaims(report);
  const reminders = reportReminders(report);
  return (
    <>
      <Facts rows={reportFacts(report)} />

      {copy.review.length > 0 ? (
        <div className="pt-4">
          <CollapsibleSection
            title={`Copy changes (${copy.review.length})`}
            defaultOpen
          >
            <ol className="flex flex-col gap-1">
              {copy.review.map((change, index) => (
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
      ) : null}

      <PanelSection
        title="Claim check"
        count={claims.length > 0 ? claims.length : undefined}
        divided
        className="mt-2"
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

      {reminders.length > 0 ? (
        <PanelSection title="Reminders" className="mt-2">
          <ul className="flex flex-col gap-2.5">
            {reminders.map((reminder) => (
              <li
                key={reminder.title}
                className="flex flex-col gap-1.5 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium"
              >
                <span className="rounded-sm bg-foreground-02 px-1.5 py-1 text-heading-02">
                  {reminder.title}
                </span>
                {reminder.detail ? (
                  <span className="text-heading-05">{reminder.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </PanelSection>
      ) : null}
    </>
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
    <dl className="flex flex-col gap-1 pt-4">
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

const ACTION_CLASS = {
  Fix: "bg-highlight-red-50 text-text-danger",
  Check: "bg-highlight-yellow-150 text-highlight-yellow-500",
} as const;

/**
 * A flagged claim (Figma Build, Claim check): a Foreground-01 card, 8 px corners, 6 px in. "Fix"
 * (Highlight-Red-50 / Text-Danger) or "Check" (Highlight-Yellow-150 / Highlight-Yellow-500) in
 * an 11 px chip, then the quoted line in Heading-05, the reason on Foreground-02 in Heading-02, and
 * under a 0.5 px line the section's button (22 px, Surface-Primary, 1 px Stroke-Strong, Shadow/Panel,
 * the locate icon and the section's name) that shows the line in the preview.
 */
function Claim({ finding }: { finding: ComplianceFinding }) {
  const action = claimAction(finding);
  const section = findingSection(finding.location);
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
        <p className="rounded-md bg-foreground-02 px-1.5 py-1 text-heading-02">
          {claimReason(finding.reason)}
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
              className="flex h-5.5 items-center gap-1 rounded-sm border border-stroke-strong bg-surface-primary px-1.5 text-type-caption-1 font-medium text-heading-01 shadow-panel transition-transform duration-150 ease-out outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring active:scale-97"
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
