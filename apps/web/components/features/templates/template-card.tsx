import Image from "next/image";
import Link from "next/link";

import { TypeGlyph, templateTypeLabel } from "@/components/app/type-glyph";
import { Button } from "@/components/ui/button";
import { TemplatesIcon } from "@/components/ui/icons";
import { ExternalLinkFigmaIcon, PlusFigmaIcon } from "@/components/ui/lp-icons";
import type { TemplateCardData } from "@/lib/templates/queries";

import { TemplateCardMenu } from "./template-card-menu";
import { UseTemplateButton } from "./use-template-button";

/** Preview in the cards (Figma: Foreground-03 in light, Foreground-01 in dark). */
const PREVIEW_BUTTON =
  "flex-1 bg-foreground-03 hover:bg-stroke-input-hover aria-expanded:bg-stroke-input-hover dark:bg-foreground-01 dark:hover:bg-foreground-02 dark:aria-expanded:bg-foreground-02";

/**
 * A template in the gallery (Figma: Template/Library 147:6911 and 142:3020, Template/Yours
 * 147:8701 and 147:11304): 18 px corners, a 0.5 px Surface/Stroke border with a 0.7 px line and
 * the edge shadow inside it (`frame-stroke`), over a 190 px picture: the painted backdrop with
 * the page's own screenshot in a white frame. Below it, 10 px in: the name, the type and section
 * count, two lines of description, and the actions 14 px under them, on Surface/Dashboard
 * (owner's choice over the frames' Foreground-01 and white). Library cards offer Use
 * Template (copies it into Yours) and Preview; your own offer Use Template (starts a page from
 * it) and ⋯ (Preview, Delete), and their picture opens the section editor.
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
  const description =
    template.description ??
    (template.parentName ? `From ${template.parentName}` : null);
  return (
    <article
      aria-labelledby={titleId}
      className="frame-stroke flex w-full flex-col overflow-hidden rounded-card bg-surface-primary"
    >
      {kind === "yours" ? (
        <Link
          href={`/templates/${template.id}`}
          aria-label={`Edit sections of ${template.name}`}
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Thumbnail templateId={template.id} />
        </Link>
      ) : (
        <Thumbnail templateId={template.id} />
      )}
      <div className="flex flex-1 flex-col gap-3.5 bg-dashboard px-2.5 pt-2.5 pb-3">
        <div className="flex flex-col gap-1.5">
          <h3
            id={titleId}
            className="truncate text-type-caption-1 font-medium text-heading-01"
          >
            {template.name}
          </h3>
          <p className="flex items-center gap-1.5 text-type-caption-2 text-heading-04">
            <TypeGlyph type={template.type} size="card" />
            <span className="flex items-center gap-1">
              <span aria-hidden>{templateTypeLabel(template.type)}</span>
              <span
                aria-hidden
                className="size-0.75 rounded-full bg-meta-dot"
              />
              {template.sections}{" "}
              {template.sections === 1 ? "section" : "sections"}
            </span>
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
                className={PREVIEW_BUTTON}
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
              <Button asChild size="compact" className="flex-1">
                <Link href={`/pages/new?template=${template.id}`}>
                  <PlusFigmaIcon />
                  Use Template
                  <span className="sr-only"> {template.name}</span>
                </Link>
              </Button>
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
 * The painted backdrop with the page in a white frame on it: Home's framed window (237 × 153,
 * 22 px from the top, the same line and shadow). The frame shows the page's own screenshot,
 * top-aligned; a template icon shows while it loads or if there's none. The frame's line is a
 * layer over the screenshot, so the picture doesn't cover it.
 */
function Thumbnail({ templateId }: { templateId: string }) {
  return (
    <div className="relative h-47.5 shrink-0 overflow-hidden">
      <Image
        src="/templates/card-backdrop.png"
        alt=""
        fill
        sizes="(min-width: 1280px) 268px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover"
      />
      <div className="absolute inset-x-3.75 top-5.5 bottom-3.75">
        <div className="relative size-full overflow-hidden rounded-sm bg-illustration-surface">
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
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-sm shadow-illustration-window"
        />
      </div>
    </div>
  );
}
