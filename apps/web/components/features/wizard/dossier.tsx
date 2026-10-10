import { CheckIcon, CloseIcon, TemplatesIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { WizardData } from "@/lib/wizard/queries";
import {
  AUTHOR_TYPES,
  IMAGE_STYLES,
  type WizardState,
  stepIndex,
} from "@/lib/wizard/state";

import type { BriefingStatus } from "./use-briefing";

const BRIEFING_LABEL: Record<BriefingStatus, string> = {
  none: "—",
  loading: "Checking…",
  writing: "Writing…",
  ready: "Ready",
  failed: "Couldn’t write it",
};

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="flex flex-col">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b border-stroke py-2 text-type-caption-1 last:border-b-0"
        >
          <dt className="shrink-0 text-sub-text">{label}</dt>
          <dd className="truncate text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The "Brand dossier" beside each step: the product and brand (photo, price, colours, the facts
 * the copywriter has), the chosen template, and the choices made so far. */
export function Dossier({
  data,
  state,
  briefing,
}: {
  data: WizardData;
  state: WizardState;
  briefing: BriefingStatus;
}) {
  const brand = data.brands.find((b) => b.id === state.brand);
  const product = data.products.find((p) => p.id === state.product);
  const template = data.templates.find((t) => t.id === state.template);
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  const facts: [string, boolean][] = product
    ? [
        ["description", product.facts.description],
        [plural(product.facts.specs, "spec"), product.facts.specs > 0],
        [plural(product.facts.usps, "selling point"), product.facts.usps > 0],
        [plural(product.facts.images, "image"), product.facts.images > 0],
        ["brand voice", Boolean(brand?.hasVoice)],
        ["positioning", Boolean(brand?.hasPositioning)],
      ]
    : [];
  const reached = stepIndex(state.step);
  const emphasis =
    state.benefits.length + state.features.length + state.objections.length;
  const choices: [string, string][] = [
    ...(reached > stepIndex("imagery")
      ? ([
          [
            "Imagery",
            state.ai
              ? state.styles.length > 0
                ? state.styles
                    .map((s) => IMAGE_STYLES.find((x) => x.id === s)?.label)
                    .join(", ")
                : "Generated"
              : "Product photos",
          ],
        ] as [string, string][])
      : []),
    ...(reached > stepIndex("audience")
      ? ([["Audience", state.audience ?? "Desk’s pick"]] as [string, string][])
      : []),
    ...(reached > stepIndex("emphasis")
      ? ([
          ["Emphasis", emphasis > 0 ? `${emphasis} chosen` : "Desk’s pick"],
          [
            "Author",
            AUTHOR_TYPES.find((a) => a.id === state.author)?.label ?? "",
          ],
        ] as [string, string][])
      : []),
  ];

  return (
    <aside aria-labelledby="dossier-title" className="flex flex-col gap-5">
      <h2 id="dossier-title" className="text-type-body-small font-semibold">
        Brand dossier
      </h2>
      {!product ? (
        <p className="text-type-caption-1 text-sub-text">
          Choose a brand and product to see what the copywriter will work from.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt=""
                className="size-16 shrink-0 rounded-md border border-stroke bg-surface-primary object-contain"
              />
            ) : null}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-type-caption-1 text-sub-text">
                {brand?.name}
              </span>
              <span className="truncate text-type-body-small font-medium">
                {product.name}
              </span>
              <span className="text-type-caption-1 text-sub-text tabular-nums">
                {product.price ?? "No price"}
              </span>
            </div>
          </div>
          {brand && brand.colours.length > 0 ? (
            <div className="flex items-center justify-between gap-3 text-type-caption-1">
              <span className="text-sub-text">Brand colours</span>
              <span className="flex items-center gap-1">
                {brand.colours.map((colour) => (
                  <span
                    key={colour}
                    title={colour}
                    className="size-5 rounded-full border border-stroke"
                    // The brand's own colour (data, not app styling).
                    style={{ backgroundColor: colour }}
                  />
                ))}
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <ul
              className="flex flex-wrap gap-1.5"
              aria-label="What the copywriter has"
            >
              {facts.map(([label, has]) => (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-type-caption-1",
                    has
                      ? "border-spot-500-green text-text-success"
                      : "border-stroke text-caption-1 line-through",
                  )}
                >
                  {has ? (
                    <CheckIcon aria-hidden className="size-3" />
                  ) : (
                    <CloseIcon aria-hidden className="size-3" />
                  )}
                  {label}
                  <span className="sr-only">{has ? "" : " (missing)"}</span>
                </li>
              ))}
            </ul>
            <p className="text-type-caption-1 text-sub-text">
              The copywriter writes from these facts. Briefing:{" "}
              <span className="font-medium text-body">
                {BRIEFING_LABEL[briefing]}
              </span>
            </p>
          </div>
        </>
      )}
      {template ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-type-caption-1 text-sub-text">Template</h3>
          <div className="flex items-center gap-3">
            <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-md border border-stroke bg-foreground-01">
              <TemplatesIcon
                aria-hidden
                className="absolute inset-0 m-auto size-4 text-caption-1"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/thumbs/template/${template.id}`}
                alt=""
                className="relative size-full object-cover object-top"
              />
            </span>
            <span className="min-w-0 truncate text-type-caption-1 font-medium">
              {template.name}
            </span>
          </div>
        </div>
      ) : null}
      {choices.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-type-caption-1 text-sub-text">Your choices</h3>
          <Rows rows={choices} />
        </div>
      ) : null}
    </aside>
  );
}
