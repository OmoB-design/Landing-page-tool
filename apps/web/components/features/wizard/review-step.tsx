"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { LoadingIcon, PagesIcon } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPage } from "@/lib/builds/actions";
import type { Briefing } from "@/lib/validators/product";
import type { WizardData } from "@/lib/wizard/queries";
import {
  AUTHOR_TYPES,
  type AuthorType,
  GENDERS,
  IMAGE_STYLES,
  type WizardState,
  wizardPayload,
} from "@/lib/wizard/state";

/** 6. Review & build: the full order, the author, and Build page (hands over to the build page,
 * which shows the live steps and then the report; D66). */
export function ReviewStep({
  data,
  state,
  update,
  briefing,
}: {
  data: WizardData;
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  briefing: Briefing | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const brand = data.brands.find((b) => b.id === state.brand);
  const product = data.products.find((p) => p.id === state.product);
  const template = data.templates.find((t) => t.id === state.template);
  const author = AUTHOR_TYPES.find((a) => a.id === state.author);
  const audienceExtra = [
    state.gender !== "any"
      ? GENDERS.find((g) => g.id === state.gender)?.label
      : null,
    state.age ? state.age.replace("-", "–") : null,
  ].filter(Boolean);
  const emphasis = [...state.benefits, ...state.features, ...state.objections];
  const rows: [string, string][] = [
    ["Brand", brand?.name ?? "—"],
    ["Product", product?.name ?? "—"],
    ["Template", template?.name ?? "—"],
    [
      "Imagery",
      state.ai
        ? state.styles.length > 0
          ? `Generated · ${state.styles.map((s) => IMAGE_STYLES.find((x) => x.id === s)?.label).join(", ")}`
          : "Generated · desk’s pick of styles"
        : "Product photos only",
    ],
    [
      "Audience",
      (state.audience ?? "Desk’s pick") +
        (audienceExtra.length > 0 ? ` (${audienceExtra.join(", ")})` : ""),
    ],
    [
      "Emphasis",
      emphasis.length > 0 ? `${emphasis.length} chosen` : "Desk’s pick",
    ],
  ];

  const build = () => {
    const payload = wizardPayload(state, briefing);
    if (!payload) {
      setError("Choose a brand, product and template first.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await createPage(payload);
      if (result.buildId) router.push(`/pages/${result.buildId}`);
      else setError(result.error ?? "Couldn't start the build.");
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-6 border-b border-border py-2.5 text-sm last:border-b-0"
          >
            <dt className="shrink-0 text-fg-muted">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {emphasis.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-fg-muted">
          {emphasis.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Author
        <Select
          value={state.author}
          onValueChange={(value) => update({ author: value as AuthorType })}
        >
          <SelectTrigger aria-label="Author" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTHOR_TYPES.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="font-normal text-fg-muted">
          {author?.hint} The copy is written in this voice; the template’s
          byline names stay.
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col items-start gap-2">
        <Button onClick={build} disabled={pending}>
          {pending ? (
            <LoadingIcon
              aria-hidden
              className="animate-spin motion-reduce:animate-spin-slow"
            />
          ) : (
            <PagesIcon aria-hidden />
          )}
          Build page
        </Button>
        <span className="text-sm text-fg-muted">
          Builds in the background; you’ll see each step, then the finished page
          and its report.
        </span>
      </div>
    </div>
  );
}
