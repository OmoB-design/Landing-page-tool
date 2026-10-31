import Link from "next/link";

import { OriginBadge } from "@/components/app/row-meta";
import { SkeletonButton, SkeletonText } from "@/components/app/skeletons";
import { TypeGlyph, templateTypeLabel } from "@/components/app/type-glyph";
import { Button } from "@/components/ui/button";
import { TemplatesIcon } from "@/components/ui/icons";
import { ExternalLinkFigmaIcon, PlusFigmaIcon } from "@/components/ui/lp-icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import type { TemplateCardData } from "@/lib/templates/queries";

import { AnalyseButton } from "./analyse-button";
import { TemplateCardMenu } from "./template-card-menu";

const ANALYSIS_LINE = {
  running: "Analysing it now…",
  failed: "The analysis didn’t finish.",
  review: "Analysed: check its sections and rules, then confirm.",
  none: "Not analysed yet.",
} as const;
import { UseTemplateButton } from "./use-template-button";

/**
 * A template in the gallery, Library and Yours alike (Figma: Template/Yours, light 154:14185 and
 * dark 187:15866): on Surface-Primary with 18 px corners and a 0.5 px Surface/Stroke border with
 * a 0.7 px line inside it (`frame-stroke`; the edge shadow is dark-only). On top, a 190 px
 * Foreground-01 well with 14 px bottom corners and a Stroke line under it holds the page's own
 * screenshot, 16 px in, in a 10 px frame (`template-shot`). Below it, 10 px in: the name (13 px
 * medium), the type and section count, two lines of description, and the actions 14 px under
 * them. Library cards offer Use Template (copies it into Yours) and Preview; your own offer Use
 * Template (starts a page from it) and ⋯ (Preview, Delete), and their picture opens the section
 * editor. Preview and ⋯ are Foreground-02 in both themes. A clone (B2.1) carries the Cloned tag
 * and its site, and until its analysis is confirmed (B2.2) says where that stands: Preview while
 * it's analysed, Review analysis once it's saved, Analyse (or Try again) when there's none.
 */
export function TemplateCard({
  template,
  kind,
}: {
  template: TemplateCardData;
  kind: "library" | "yours";
}) {
  const titleId = `template-${template.id}`;
  const previewHref = `/preview/template/${template.id}`;
  const cloned = template.origin === "cloned";
  const description = cloned
    ? [
        `Cloned from ${template.sourceHost}.`,
        template.verdict === "rebuild_native" ? "A store product page." : null,
        template.analysis ? ANALYSIS_LINE[template.analysis] : null,
      ]
        .filter(Boolean)
        .join(" ")
    : (template.description ??
      (template.parentName ? `From ${template.parentName}` : null));
  return (
    <article
      aria-labelledby={titleId}
      className="frame-stroke flex w-full flex-col overflow-hidden rounded-card bg-surface-primary"
    >
      {kind === "yours" ? (
        <Link
          href={`/templates/${template.id}`}
          aria-label={`Edit sections of ${template.name}`}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Thumbnail templateId={template.id} />
        </Link>
      ) : (
        <Thumbnail templateId={template.id} />
      )}
      <div className="flex flex-1 flex-col gap-3.5 px-2.5 pt-2.5 pb-3">
        <div className="flex flex-col gap-1.5">
          <h3
            id={titleId}
            className="truncate text-type-body-small font-medium text-heading-01"
          >
            {template.name}
          </h3>
          <p className="flex items-center gap-1.5 text-type-caption-2 text-heading-04">
            <TypeGlyph type={template.type} size="card" />
            <span className="flex items-center gap-1">
              <span aria-hidden>{templateTypeLabel(template.type)}</span>
              {cloned && template.sections === 0 ? null : (
                <>
                  <span
                    aria-hidden
                    className="size-0.75 rounded-full bg-meta-dot"
                  />
                  {template.sections}{" "}
                  {template.sections === 1 ? "section" : "sections"}
                </>
              )}
            </span>
            {cloned ? (
              <span className="ml-auto">
                <OriginBadge origin="cloned" />
              </span>
            ) : null}
          </p>
          {description ? (
            <p className="line-clamp-2 text-type-caption-2 text-heading-05">
              {description}
            </p>
          ) : null}
        </div>
        <div className="mt-auto flex gap-1.5">
          {kind === "library" ? (
            <>
              <UseTemplateButton
                templateId={template.id}
                name={template.name}
              />
              <Button
                asChild
                variant="secondary"
                size="compact"
                className="flex-1"
              >
                <a href={previewHref} target="_blank" rel="noreferrer">
                  <ExternalLinkFigmaIcon />
                  Preview
                  <span className="sr-only">
                    {" "}
                    {template.name} (opens in a new tab)
                  </span>
                </a>
              </Button>
            </>
          ) : (
            <>
              {template.ready ? (
                <Button asChild size="compact" className="flex-1">
                  <Link href={`/pages/new?template=${template.id}`}>
                    <PlusFigmaIcon />
                    Use Template
                    <span className="sr-only"> {template.name}</span>
                  </Link>
                </Button>
              ) : template.analysis === "review" ? (
                <Button asChild size="compact" className="flex-1">
                  <Link href={`/templates/${template.id}`}>
                    Review analysis
                    <span className="sr-only"> of {template.name}</span>
                  </Link>
                </Button>
              ) : template.analysis === "none" ||
                template.analysis === "failed" ? (
                <AnalyseButton
                  templateId={template.id}
                  label={
                    template.analysis === "failed" ? "Try again" : "Analyse"
                  }
                />
              ) : (
                <Button
                  asChild
                  variant="secondary"
                  size="compact"
                  className="flex-1"
                >
                  <a href={previewHref} target="_blank" rel="noreferrer">
                    <ExternalLinkFigmaIcon />
                    Preview
                    <span className="sr-only">
                      {" "}
                      {template.name} (opens in a new tab)
                    </span>
                  </a>
                </Button>
              )}
              <TemplateCardMenu
                templateId={template.id}
                name={template.name}
                previewHref={previewHref}
              />
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * The picture well: the page's own screenshot, top-aligned, in its frame; a template icon shows
 * while it loads or if there's none.
 */
function Thumbnail({ templateId }: { templateId: string }) {
  return (
    <div className="flex h-47.5 shrink-0 overflow-hidden rounded-b-well border-b border-stroke bg-foreground-01 p-4">
      <div className="relative flex-1 overflow-hidden template-shot">
        <TemplatesIcon
          aria-hidden
          className="absolute inset-0 m-auto size-6 text-caption-1"
        />
        {/* Thumbnails come from private storage through an authenticated route. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/thumbs/template/${templateId}`}
          alt=""
          loading="lazy"
          className="relative size-full object-cover object-top"
        />
      </div>
    </div>
  );
}

/**
 * A card while the templates load: the picture well in its frame, the name, the type and section
 * count and a line of description, then the two 26 px buttons.
 */
export function TemplateCardSkeleton() {
  return (
    <div
      aria-hidden
      className="frame-stroke flex w-full flex-col overflow-hidden rounded-card bg-surface-primary"
    >
      <div className="flex h-47.5 shrink-0 overflow-hidden rounded-b-well border-b border-stroke bg-foreground-01 p-4">
        <div className="relative flex-1 overflow-hidden template-shot">
          <Skeleton height="100%" radius="0" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-2.5 pt-2.5 pb-3">
        <div className="flex flex-col gap-1.5">
          <SkeletonText className="text-type-body-small" width="62%" />
          <SkeletonText className="text-type-caption-2" width="46%" />
          <span className="flex flex-col">
            <SkeletonText className="text-type-caption-2" width="94%" />
            <SkeletonText className="text-type-caption-2" width="58%" />
          </span>
        </div>
        <div className="mt-auto flex gap-1.5">
          {[0, 1].map((index) => (
            <span key={index} className="flex-1">
              <SkeletonButton
                width="100%"
                height={26}
                radius="var(--radius-md)"
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
