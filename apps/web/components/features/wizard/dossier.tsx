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
          className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0"
        >
          <dt className="shrink-0 text-fg-muted">{label}</dt>
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
      <h2 id="dossier-title" className="text-base font-semibold">
        Brand dossier
      </h2>
      {!product ? (
        <p className="text-sm text-fg-muted">
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
                className="size-16 shrink-0 rounded-md border border-border bg-surface object-contain"
              />
            ) : null}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-fg-muted">
                {brand?.name}
              </span>
              <span className="truncate text-base font-medium">
                {product.name}
              </span>
              <span className="text-sm text-fg-muted tabular-nums">
                {product.price ?? "No price"}
              </span>
            </div>
          </div>
          {brand && brand.colours.length > 0 ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-fg-muted">Brand colours</span>
              <span className="flex items-center gap-1">
                {brand.colours.map((colour) => (
                  <span
                    key={colour}
                    title={colour}
                    className="size-5 rounded-full border border-border"
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
                    "flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-sm",
                    has
                      ? "border-success text-success"
                      : "border-border text-fg-subtle line-through",
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
            <p className="text-sm text-fg-muted">
              The copywriter writes from these facts. Briefing:{" "}
              <span className="font-medium text-fg">
                {BRIEFING_LABEL[briefing]}
              </span>
            </p>
          </div>
        </>
      )}
      {template ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-fg-muted">Template</h3>
          <div className="flex items-center gap-3">
            <span className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface-muted">
              <TemplatesIcon
                aria-hidden
                className="absolute inset-0 m-auto size-4 text-fg-subtle"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/thumbs/template/${template.id}`}
                alt=""
                className="relative size-full object-cover object-top"
              />
            </span>
            <span className="min-w-0 truncate text-sm font-medium">
              {template.name}
            </span>
          </div>
        </div>
      ) : null}
      {choices.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm text-fg-muted">Your choices</h3>
          <Rows rows={choices} />
        </div>
      ) : null}
    </aside>
  );
}
