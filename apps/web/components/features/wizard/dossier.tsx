import { CheckIcon, CloseIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { WizardData } from "@/lib/wizard/queries";
import type { WizardState } from "@/lib/wizard/state";

import type { BriefingStatus } from "./use-briefing";

const BRIEFING_LABEL: Record<BriefingStatus, string> = {
  none: "—",
  loading: "Checking…",
  writing: "Writing…",
  ready: "Ready",
  failed: "Couldn’t write it",
};

/** The right-hand "Brand dossier" (reference tool): what the copywriter knows about the chosen
 * brand and product, as ticked facts. */
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
  const facts = product
    ? [
        ["description", product.facts.description],
        [plural(product.facts.specs, "spec"), product.facts.specs > 0],
        [plural(product.facts.usps, "selling point"), product.facts.usps > 0],
        [plural(product.facts.images, "image"), product.facts.images > 0],
        ["brand voice", Boolean(brand?.hasVoice)],
        ["positioning", Boolean(brand?.hasPositioning)],
      ]
    : [];
  const rows: [string, string][] = [
    ["Brand", brand?.name ?? "—"],
    ["Product", product?.name ?? "—"],
    ["Price", product?.price ?? "—"],
    ...(template ? ([["Template", template.name]] as [string, string][]) : []),
    ...(product
      ? ([["Briefing", BRIEFING_LABEL[briefing]]] as [string, string][])
      : []),
  ];
  return (
    <aside aria-labelledby="dossier-title" className="flex flex-col gap-4">
      <h2 id="dossier-title" className="text-base font-semibold">
        Brand dossier
      </h2>
      {product?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt=""
          className="aspect-square w-full rounded-md border border-border bg-surface-muted object-contain"
        />
      ) : null}
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
      {facts.length > 0 ? (
        <>
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label="What the copywriter has"
          >
            {facts.map(([label, has]) => (
              <li
                key={String(label)}
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
            The copywriter writes from these facts.
          </p>
        </>
      ) : (
        <p className="text-sm text-fg-muted">
          Choose a brand and product to see what the copywriter will work from.
        </p>
      )}
    </aside>
  );
}
