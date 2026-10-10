"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WizardData } from "@/lib/wizard/queries";
import {
  AUTHOR_TYPES,
  type AuthorType,
  GENDERS,
  IMAGE_STYLES,
  type WizardState,
} from "@/lib/wizard/state";

/** 6. Review & build: the full order and the author. Build page sits in the wizard's bottom bar
 * and hands over to the build page (D66). */
export function ReviewStep({
  data,
  state,
  update,
}: {
  data: WizardData;
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}) {
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

  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-6 border-b border-stroke py-2.5 text-type-caption-1 last:border-b-0"
          >
            <dt className="shrink-0 text-sub-text">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {emphasis.length > 0 ? (
        <ul className="flex flex-col gap-1 text-type-caption-1 text-sub-text">
          {emphasis.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      ) : null}
      <label className="flex flex-col gap-1.5 text-type-caption-1 font-medium">
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
        <span className="font-normal text-sub-text">
          {author?.hint} The copy is written in this voice; the template’s
          byline names stay.
        </span>
      </label>
    </div>
  );
}
