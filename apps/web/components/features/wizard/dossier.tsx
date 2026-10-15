import type { ReactNode } from "react";

import { ImageOptionIcon } from "@/components/ui/lp-icons";
import { TemplatesIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { WizardData } from "@/lib/wizard/queries";
import {
  AUTHOR_TYPES,
  GENDERS,
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

/** A pale brand colour (a tint, white) needs a line to show on the panel. */
function isPale(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0) > 0.85;
}

/**
 * Figma's 0.5 px dashed stroke (4 px dashes, 4 px gaps) inside a 4 px-cornered chip: an SVG, since
 * a CSS dashed border that thin comes out as uneven dots. Icon-System in light, Illustration-Line
 * in dark.
 */
function DashedOutline() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full overflow-visible text-icon-system dark:text-illustration-line"
    >
      <rect
        x="0.25"
        y="0.25"
        rx="3.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeDasharray="4 4"
        // The chip's size less the line (CSS geometry, so it follows the text).
        style={{ width: "calc(100% - 0.5px)", height: "calc(100% - 0.5px)" }}
      />
    </svg>
  );
}

/**
 * A dossier section below the first (Figma: Brand & product panel): a 0.5 px Stroke-Strong line,
 * 16 px above its content. New ones fade in as the wizard reaches them.
 */
function Section({
  label,
  tone = "strong",
  gap = "gap-1.5",
  children,
}: {
  label?: string;
  tone?: "strong" | "soft";
  gap?: "gap-1.5" | "gap-3" | "gap-4";
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex animate-step-in flex-col pt-4 divider-t-strong motion-reduce:animate-none",
        gap,
      )}
    >
      {label ? (
        <h3
          className={cn(
            "text-type-caption-1 font-medium",
            tone === "strong" ? "text-heading-01" : "text-heading-04",
          )}
        >
          {label}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The brand dossier beside every step (Figma: Create new page, the "Brand & product" panel): the
 * product on Foreground-02 (its photo, the brand, the name and the price), the brand colours with
 * their hex codes, the facts the copywriter has (Spot-500-Blue chips; missing ones struck through),
 * the briefing's state, the chosen template, and the choices from the steps already passed.
 */
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
        ["Description", product.facts.description],
        [plural(product.facts.specs, "spec"), product.facts.specs > 0],
        [plural(product.facts.usps, "selling point"), product.facts.usps > 0],
        [plural(product.facts.images, "image"), product.facts.images > 0],
        ["Brand voice", Boolean(brand?.hasVoice)],
        ["Positioning", Boolean(brand?.hasPositioning)],
      ]
    : [];
  const reached = stepIndex(state.step);
  const emphasis =
    state.benefits.length + state.features.length + state.objections.length;
  const audienceExtra = [
    state.gender !== "any"
      ? GENDERS.find((g) => g.id === state.gender)?.label
      : null,
    state.age ? state.age.replace("-", "–") : null,
  ].filter(Boolean);
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
      ? ([
          [
            "Audience",
            (state.audience ?? "Desk’s pick") +
              (audienceExtra.length > 0
                ? ` (${audienceExtra.join(", ")})`
                : ""),
          ],
        ] as [string, string][])
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
    <>
      {!product ? (
        <p className="text-type-caption-1 font-medium text-heading-05">
          Choose a brand and product to see what the copywriter will work from.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-4 bg-foreground-02 p-3 dark:bg-overlay">
            <span className="flex size-18.75 shrink-0 items-center justify-center overflow-hidden bg-surface-primary text-icon-system">
              {product.imageUrl ? (
                // Product images are stored in the public assets bucket.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <ImageOptionIcon aria-hidden />
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-type-caption-1 font-medium text-heading-01">
                {brand?.name}
              </span>
              <span className="text-type-caption-1 leading-snug text-heading-04">
                {product.name}
              </span>
              <span className="text-type-caption-2 font-medium text-heading-01 tabular-nums">
                {product.price ?? "No price"}
              </span>
            </span>
          </div>

          {brand && brand.colours.length > 0 ? (
            <Section label="Brand Colours" gap="gap-4">
              <ul className="flex justify-between gap-2 pb-1.5">
                {brand.colours.map((colour) => (
                  <li
                    key={colour.name}
                    className="flex flex-col items-center gap-2"
                  >
                    <span className="text-type-caption-1 font-medium text-heading-03">
                      {colour.name}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "size-7.5 rounded-md",
                        isPale(colour.hex) &&
                          "ring-thin ring-stroke-strong ring-inset",
                      )}
                      // The brand's own colour (data, not app styling).
                      style={{ backgroundColor: colour.hex }}
                    />
                    <span className="rounded-xsm bg-foreground-02 px-1 py-0.5 text-type-caption-1 font-medium text-heading-04 uppercase">
                      {colour.hex}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section>
            <ul
              aria-label="What the copywriter has"
              className="flex flex-wrap gap-1.5"
            >
              {facts.map(([label, has]) => (
                <li
                  key={label}
                  className={cn(
                    "rounded-xsm border px-1.5 py-0.5 text-type-caption-1 font-medium",
                    has
                      ? "border-spot-500-blue text-heading-04"
                      : "border-stroke text-heading-06 line-through",
                  )}
                >
                  {label}
                  {has ? null : <span className="sr-only"> (missing)</span>}
                </li>
              ))}
            </ul>
          </Section>

          <Section>
            <span className="w-fit rounded-xsm bg-foreground-02 px-1 py-0.5 text-type-caption-1 font-medium text-heading-05">
              The copywriter writes from these facts.
            </span>
            <span className="relative w-fit rounded-xsm bg-foreground-02 px-1.25 py-0.75 text-type-caption-1 font-medium text-heading-05">
              <DashedOutline />
              Briefing:{" "}
              <span className="text-heading-04">
                {BRIEFING_LABEL[briefing]}
              </span>
            </span>
          </Section>
        </>
      )}

      {template ? (
        <Section label="Template">
          <div className="flex items-center gap-2 bg-foreground-01 py-0.5">
            <span className="relative block size-13.75 shrink-0 overflow-hidden bg-foreground-02">
              <TemplatesIcon
                aria-hidden
                className="absolute inset-0 m-auto size-4 text-caption-1"
              />
              {/* Thumbnails come from private storage through an authenticated route. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/thumbs/template/${template.id}`}
                alt=""
                className="relative size-full object-cover object-top"
              />
            </span>
            <span className="min-w-0 truncate text-type-caption-1 font-medium text-heading-01">
              {template.name}
            </span>
          </div>
        </Section>
      ) : null}

      {choices.length > 0 ? (
        <Section label="Your choices" tone="soft" gap="gap-3">
          <dl className="flex flex-col gap-1.5">
            {choices.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-1.5 pb-1.5 text-type-caption-1 font-medium divider-b-strong"
              >
                <dt className="shrink-0 text-heading-05">{label}</dt>
                <dd className="min-w-0 truncate text-right text-heading-01">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
    </>
  );
}
