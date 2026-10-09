import { RelativeTime } from "@/components/app/row-meta";
import { TypeGlyph, templateTypeLabel } from "@/components/app/type-glyph";
import { Button } from "@/components/ui/button";
import { ExternalLinkIcon, TemplatesIcon } from "@/components/ui/icons";
import type { TemplateCardData } from "@/lib/templates/queries";

import { DeleteTemplateButton } from "./delete-template-button";
import { UseTemplateButton } from "./use-template-button";

/** A template in the gallery: thumbnail, name, type, description, sections, actions. */
export function TemplateCard({
  template,
  kind,
}: {
  template: TemplateCardData;
  kind: "library" | "yours";
}) {
  const titleId = `template-${template.id}`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="relative aspect-4/3 overflow-hidden border-b border-border bg-surface-muted">
        {/* Shows while the thumbnail loads, or if there isn't one; the image paints over it. */}
        <TemplatesIcon
          aria-hidden
          className="absolute inset-0 m-auto size-6 text-fg-subtle"
        />
        {/* Thumbnails come from private storage through an authenticated route. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/thumbs/template/${template.id}`}
          alt=""
          loading="lazy"
          className="relative size-full object-cover object-top"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 id={titleId} className="text-base font-semibold">
          {template.name}
        </h3>
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <TypeGlyph type={template.type} />
          {templateTypeLabel(template.type)} · {template.sections}{" "}
          {template.sections === 1 ? "section" : "sections"}
        </p>
        {kind === "yours" ? (
          <p className="text-sm text-fg-muted">
            {template.parentName ? `From ${template.parentName} · ` : ""}
            Version {template.version} ·{" "}
            <RelativeTime date={template.updatedAt} />
          </p>
        ) : template.description ? (
          <p className="line-clamp-2 text-sm text-fg-muted">
            {template.description}
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {kind === "library" ? (
            <UseTemplateButton templateId={template.id} name={template.name} />
          ) : (
            <DeleteTemplateButton
              templateId={template.id}
              name={template.name}
            />
          )}
          <Button asChild variant="ghost" size="sm" className="h-8">
            <a
              href={`/preview/template/${template.id}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLinkIcon aria-hidden />
              Preview
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
