"use client";

import { SelectField } from "@/components/app/select-field";
import type { WizardData } from "@/lib/wizard/queries";
import {
  AUTHOR_TYPES,
  type AuthorType,
  GENDERS,
  IMAGE_STYLES,
  type WizardState,
} from "@/lib/wizard/state";

/**
 * 6. Review & build: the full order and the author. Build page sits in the wizard's footer and
 * hands over to the build page (D66). No Figma frame yet: it uses the steps' language, the order
 * as the dossier's choice rows (12 px medium, Heading-05 / Heading-01 on 0.5 px Stroke-Strong
 * lines) and the author as the Input Field's dropdown.
 */
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
  // A batch's pages (B3.5), in the gallery's order.
  const ticked = state.batch
    ? data.templates.filter((t) => state.templates.includes(t.id))
    : [];
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
    state.batch
      ? [
          "Templates",
          `${ticked.length} ${ticked.length === 1 ? "page" : "pages"}, one from each`,
        ]
      : ["Template", template?.name ?? "—"],
    ...(state.ranking
      ? ([
          [
            "Competitors",
            `${state.competitors.length} pages · ${state.naming === "real" ? "real names and photos" : "neutral labels (Brand B to E)"}`,
          ],
        ] as [string, string][])
      : []),
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
      <dl className="flex flex-col gap-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-6 pb-2 text-type-caption-1 font-medium divider-b-strong"
          >
            <dt className="shrink-0 text-heading-05">{label}</dt>
            <dd className="text-right text-heading-01">{value}</dd>
          </div>
        ))}
      </dl>
      {state.batch ? (
        <div className="flex flex-col gap-1.5">
          <ol aria-label="Templates" className="flex flex-col gap-1.5">
            {ticked.map((t, index) => (
              <li
                key={t.id}
                className="flex gap-2 rounded-md bg-foreground-02 px-1.5 py-1.5 text-type-caption-1 font-medium text-heading-02 dark:bg-overlay"
              >
                <span className="shrink-0 text-heading-05 tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 truncate">{t.name}</span>
              </li>
            ))}
          </ol>
          <p className="text-type-caption-2 font-medium text-heading-05">
            Each page’s copy is written by Claude, about $0.05–0.35 a page
            {state.ai
              ? "; AI pictures are free placeholders until fal is set up, then $0.15 each"
              : ""}
            . They build two at a time; a batch counts towards the workspace’s
            20 pages an hour.
          </p>
        </div>
      ) : null}
      {state.ranking ? (
        <ol aria-label="Competitors" className="flex flex-col gap-1.5">
          {state.competitors.map((url, index) => (
            <li
              key={url || index}
              className="flex gap-2 rounded-md bg-foreground-02 px-1.5 py-1.5 text-type-caption-1 font-medium text-heading-02 dark:bg-overlay"
            >
              <span className="shrink-0 text-heading-05 tabular-nums">
                #{index + 2}
              </span>
              <span className="min-w-0 truncate">{url}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {emphasis.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {emphasis.map((line) => (
            <li
              key={line}
              className="rounded-md bg-foreground-02 px-1.5 py-1.5 text-type-caption-1 font-medium text-heading-02 dark:bg-overlay"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <SelectField
          label="Author"
          placeholder="Article writer"
          value={state.author}
          options={AUTHOR_TYPES.map((a) => ({ value: a.id, label: a.label }))}
          onValueChange={(value) => update({ author: value as AuthorType })}
        />
        <p className="text-type-caption-2 font-medium text-heading-05">
          {author?.hint} The copy is written in this voice; the template’s
          byline names stay.
        </p>
      </div>
    </div>
  );
}
