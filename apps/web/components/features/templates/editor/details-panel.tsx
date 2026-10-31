"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { RelativeTime } from "@/components/app/row-meta";
import { toast } from "@/components/app/toaster";
import { templateTypeLabel } from "@/components/app/type-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { HistoryIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveTemplateDetails } from "@/lib/templates/actions";
import { cn } from "@/lib/utils";
import {
  type TemplateDetails,
  type TemplateEditorState,
  templateDetailsSchema,
} from "@/lib/validators/template";

import { QUIET } from "./analysis-bar";

const PLATFORMS: Record<string, string> = {
  shopify: "Shopify",
  replo: "Replo",
  webflow: "Webflow",
  clickfunnels: "ClickFunnels",
  funnelish: "Funnelish",
  wordpress: "WordPress",
  framer: "Framer",
};

/** The Details tab: name and description, where the template came from (and, for a clone, its
 * analysis), and its saved versions (the newest 12) with Restore. */
export function DetailsPanel({
  state,
  pending,
  analysing = false,
  onAnalyse,
  onRestore,
  onSaved,
}: {
  state: TemplateEditorState;
  pending: boolean;
  /** A clone's analysis is running. */
  analysing?: boolean;
  /** Analyse again (clones). */
  onAnalyse?: () => void;
  onRestore: (version: number) => void;
  onSaved: (details: TemplateDetails) => void;
}) {
  const { template } = state;
  const [saving, startSaving] = useTransition();
  const form = useForm<TemplateDetails>({
    resolver: zodResolver(templateDetailsSchema),
    defaultValues: {
      name: template.name,
      description: template.description ?? "",
    },
  });
  const errors = form.formState.errors;
  const source = template.source;
  const analysis = template.analysis;
  const facts: [string, string][] = [
    ["Type", templateTypeLabel(template.type)],
    [
      "From",
      source
        ? `${source.host} (cloned${source.platform ? `, ${PLATFORMS[source.platform] ?? source.platform}` : ""})`
        : template.parent_name
          ? `${template.parent_name} (library)`
          : "—",
    ],
    ...(analysis
      ? ([
          [
            "Analysed",
            `${format(new Date(analysis.analysed_at), "d MMM yyyy")} · ${analysis.ai === "mock" ? "mock" : analysis.model}`,
          ],
          [
            "Confirmed",
            analysis.reviewed_at
              ? `${format(new Date(analysis.reviewed_at), "d MMM yyyy")}${analysis.reviewed_by ? ` · ${analysis.reviewed_by}` : ""}`
              : "Not yet",
          ],
        ] as [string, string][])
      : []),
    ["Version", String(template.version)],
  ];

  return (
    <div className="flex flex-col gap-6 p-4">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          startSaving(async () => {
            const result = await saveTemplateDetails(template.id, values);
            if (result.ok) {
              onSaved(values);
              form.reset(values);
              toast.success("Saved the template’s details");
            } else {
              toast.error(result.error ?? "Couldn't save.");
            }
          }),
        )}
      >
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="template-name">Name</FieldLabel>
          <Input
            id="template-name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "template-name-error" : undefined}
            defaultValue={form.formState.defaultValues?.name ?? ""}
            {...form.register("name")}
          />
          {errors.name ? (
            <FieldError id="template-name-error">
              {errors.name.message}
            </FieldError>
          ) : null}
        </Field>
        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="template-description">Description</FieldLabel>
          <Textarea
            id="template-description"
            rows={3}
            aria-invalid={errors.description ? true : undefined}
            defaultValue={form.formState.defaultValues?.description ?? ""}
            {...form.register("description")}
          />
          {errors.description ? (
            <FieldError>{errors.description.message}</FieldError>
          ) : null}
        </Field>
        <Button
          type="submit"
          size="sm"
          className="h-8 self-start"
          disabled={saving || !form.formState.isDirty}
        >
          Save details
        </Button>
      </form>

      {source && onAnalyse ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-type-body-small font-medium">Analysis</h2>
          <p className="text-type-caption-1 text-sub-text">
            Reads the page again for its sections, colours, brand words and
            rules (one Claude call, a few cents). The sections and rules are
            replaced, and it needs confirming again.
          </p>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 self-start", QUIET)}
            disabled={analysing}
            onClick={onAnalyse}
          >
            {analysing ? "Analysing…" : analysis ? "Analyse again" : "Analyse"}
          </Button>
        </section>
      ) : null}

      <dl className="flex flex-col gap-1.5">
        {facts.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1"
          >
            <dt className="text-sub-text">{label}</dt>
            <dd className="truncate">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-type-body-small font-medium">
          <HistoryIcon aria-hidden className="size-4 text-sub-text" />
          Version history
        </h2>
        <p className="text-type-caption-1 text-sub-text">
          Every change is saved. The newest 12 versions are kept.
        </p>
        <ol className="flex flex-col gap-1.5">
          {state.versions.map((version) => (
            <li
              key={version.version}
              className="flex items-center gap-3 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 font-medium">
                  Version {version.version}
                  {version.current ? (
                    <Badge variant="outline">Current</Badge>
                  ) : null}
                </span>
                <span className="truncate text-sub-text">
                  {version.reason ?? "Saved"}
                </span>
              </span>
              <RelativeTime date={new Date(version.created_at)} />
              {version.current ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0"
                  disabled={pending}
                  onClick={() => onRestore(version.version)}
                >
                  Restore
                  <span className="sr-only"> version {version.version}</span>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
