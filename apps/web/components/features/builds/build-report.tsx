import { formatCost } from "@/components/app/row-meta";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertIcon } from "@/components/ui/icons";
import type { BuildReport as Report } from "@/lib/validators/build";

const SEVERITY_CLASS = {
  high: "border-danger/30 bg-danger-soft text-danger",
  medium: "border-warning/30 bg-warning-soft text-warning",
  low: "border-border bg-surface-muted text-fg-muted",
} as const;

/** What the pipeline did and what needs attention (BUILD_SPEC §10.6, §11.1 banners). */
export function BuildReport({ report }: { report: Report }) {
  const { images, copy, compliance, brand, layout } = report;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {report.mock_images ? (
          <Notice tone="danger" title="Placeholder images">
            Scenes and people are placeholders, so this page can&apos;t be
            published. Real images arrive in B1.3.
          </Notice>
        ) : null}
        {copy.skipped ? (
          <Notice tone="warning" title="Copy not rewritten yet">
            The template&apos;s own words are still on the page. The copy
            rewrite arrives in B0.6b.
          </Notice>
        ) : null}
        {compliance.high_risk_count > 0 ? (
          <Notice tone="danger" title="Claims to fix before publishing">
            {compliance.high_risk_count} high-risk{" "}
            {compliance.high_risk_count === 1 ? "claim" : "claims"} found.
          </Notice>
        ) : null}
      </div>

      <Facts
        rows={[
          ["Template", report.template.name],
          [
            "Sections",
            [
              layout.removed.length
                ? `removed ${layout.removed.join(", ")}`
                : "",
              layout.duplicated.length
                ? `added ${layout.duplicated.join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join("; ") || "in the template's order",
          ],
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
          ["Options", brand.variants ? `${brand.variants.units}` : "none"],
          [
            "Removed terms",
            copy.purged_terms.map((t) => t.term).join(", ") || "none",
          ],
          ["Cost", formatCost(report.cost.total_usd)],
        ]}
      />

      <section aria-labelledby="claims-title" className="flex flex-col gap-2">
        <h3 id="claims-title" className="text-sm font-medium text-fg-muted">
          Claims check
        </h3>
        {compliance.findings.length === 0 ? (
          <p className="text-sm">Nothing flagged.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {compliance.findings.map((finding) => (
              <li
                key={`${finding.rule}-${finding.location}-${finding.text}`}
                className="flex flex-col gap-1 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`h-5 rounded-xs px-1.5 font-normal capitalize ${SEVERITY_CLASS[finding.severity]}`}
                  >
                    {finding.severity}
                  </Badge>
                  <span className="text-fg-muted">{finding.location}</span>
                </span>
                <span>“{finding.text}”</span>
                <span className="text-fg-muted">{finding.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {report.warnings.length > 0 ? (
        <section aria-labelledby="notes-title" className="flex flex-col gap-2">
          <h3 id="notes-title" className="text-sm font-medium text-fg-muted">
            Notes
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "danger" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Alert
      className={
        tone === "danger"
          ? "border-danger/30 bg-danger-soft"
          : "border-warning/30 bg-warning-soft"
      }
    >
      <AlertIcon
        aria-hidden
        className={tone === "danger" ? "text-danger" : "text-warning"}
      />
      <AlertTitle className="text-fg">{title}</AlertTitle>
      <AlertDescription className="text-fg-muted">{children}</AlertDescription>
    </Alert>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-fg-muted">{label}</dt>
          <dd className="col-span-2">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
