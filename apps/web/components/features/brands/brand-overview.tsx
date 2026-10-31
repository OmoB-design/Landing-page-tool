import Link from "next/link";
import type { ReactNode } from "react";

import { BrandColumn, BrandFrame } from "@/components/app/brand-frame";
import { SkeletonStatus, SkeletonText } from "@/components/app/skeletons";
import { ExternalLinkSmallFigmaIcon } from "@/components/ui/lp-icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import type { getBrand } from "@/lib/brands/queries";

import { BudgetMeter, resetsOn } from "./budget-meter";

type Brand = NonNullable<Awaited<ReturnType<typeof getBrand>>>;

const SWATCHES = [
  { name: "primary", label: "Primary" },
  { name: "dark", label: "Dark" },
  { name: "tint", label: "Tint" },
  { name: "accent", label: "Accent" },
] as const;

/**
 * The Overview tab (Figma Brands Details: Brands/detail page, light and dark). In the frame's
 * header: the logo in a Foreground-01 box (the name in the serif title when there's no logo),
 * Edit Brand DNA on the right, then the name, tagline and website. Below the line, in a 600 px
 * column 40 px apart: colours (a 65 x 36 swatch and its hex), fonts and voice, each under a
 * 14 px medium label.
 */
export function BrandOverview({
  brand,
  spentUsd,
}: {
  brand: Brand;
  /** This month's AI spend (D54). */
  spentUsd: number;
}) {
  const { row } = brand;
  const palette = (row.palette ?? {}) as Record<
    string,
    string | null | undefined
  >;
  const fonts = (row.fonts ?? {}) as Record<string, string | null | undefined>;
  const swatches = SWATCHES.flatMap((swatch) => {
    const hex = palette[swatch.name];
    return hex ? [{ ...swatch, hex }] : [];
  });
  const fontChips = [
    { label: "Headings", value: fonts.heading },
    { label: "Body", value: fonts.body },
  ].filter((font): font is { label: string; value: string } =>
    Boolean(font.value),
  );

  return (
    <BrandFrame header={<OverviewHeader brand={brand} />}>
      <BrandColumn>
        <div className="flex flex-col gap-10">
          <Detail title="AI budget">
            <BudgetMeter
              spentUsd={spentUsd}
              budgetUsd={
                row.monthly_budget_usd ? Number(row.monthly_budget_usd) : null
              }
              resets={resetsOn()}
            />
          </Detail>
          <Detail title="Colours">
            {swatches.length > 0 ? (
              <ul className="grid grid-cols-2 gap-4 sm:flex sm:justify-between sm:gap-2">
                {swatches.map((swatch) => (
                  <li key={swatch.name} className="flex flex-col gap-2">
                    <Label>{swatch.label}</Label>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        // The brand's own colour, not a theme value.
                        style={{ backgroundColor: swatch.hex }}
                        className="h-9 w-16.25 rounded-md ring-thin ring-stroke ring-inset"
                      />
                      <Chip size="hex">{swatch.hex.toUpperCase()}</Chip>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No colours yet.</Empty>
            )}
          </Detail>

          <Detail title="Fonts">
            {fontChips.length > 0 ? (
              <ul className="flex flex-wrap gap-4">
                {fontChips.map((font) => (
                  <li key={font.label} className="flex flex-col gap-2">
                    <Label>{font.label}</Label>
                    <Chip>{font.value}</Chip>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No fonts yet.</Empty>
            )}
          </Detail>

          <Detail title="Voice">
            <div className="flex flex-col gap-3">
              {row.voice ? (
                <p className="text-type-body-small font-medium text-heading-03">
                  {row.voice}
                </p>
              ) : (
                <Empty>Not written yet.</Empty>
              )}
              {row.voice_examples.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {row.voice_examples.map((line) => (
                    <li key={line} className="max-w-full">
                      <Chip>“{line}”</Chip>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Detail>
        </div>
      </BrandColumn>
    </BrandFrame>
  );
}

/** The header block: logo box and Edit Brand DNA, then the name, tagline and website. */
function OverviewHeader({ brand }: { brand: Brand }) {
  const { row } = brand;
  return (
    <div className="mx-auto flex w-full max-w-150 flex-col gap-1.5 pr-1 pb-2.5">
      <div className="flex items-center justify-between gap-4">
        <span className="flex h-11.5 max-w-60 items-center rounded-sm bg-foreground-01 px-3 py-1.5">
          {brand.logoUrl ? (
            // Brand logos are stored in the public assets bucket.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={`${row.name} logo`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="font-serif text-type-title font-medium text-button-secondary-text">
              {row.name}
            </span>
          )}
        </span>
        <Link
          href={`/brands/${row.id}/dna`}
          className="flex h-7.5 shrink-0 items-center rounded-md px-1.5 text-type-caption-1 font-medium text-heading-04 ring-thin ring-stroke outline-none ring-inset hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Edit Brand DNA
        </Link>
      </div>
      <h2 className="font-serif text-type-title font-medium text-button-secondary-text">
        {row.name}
      </h2>
      {row.tagline ? (
        <p className="text-type-body-small font-medium text-sub-text">
          {row.tagline}
        </p>
      ) : null}
      {row.url ? (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 rounded-xsm text-type-body-small font-medium text-body outline-none hover:text-sub-text focus-visible:ring-2 focus-visible:ring-ring"
        >
          {new URL(row.url).hostname}
          <ExternalLinkSmallFigmaIcon className="text-icon-nav-active" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}

/**
 * The Overview while the brand loads, measured against a loaded brand that has its DNA (the usual
 * case: brands are read from their store; 2026-10-31): the logo box and Edit Brand DNA, the name,
 * tagline and website as lines of their own type; This month with its chip and note; the four
 * colour labels over a 65 x 36 swatch and its hex chip; the two font labels over their chips; two
 * lines of voice and two example chips. A brand with no DNA yet shows less.
 */
export function BrandOverviewSkeleton() {
  return (
    <BrandFrame
      header={
        <div className="mx-auto flex w-full max-w-150 flex-col gap-1.5 pr-1 pb-2.5">
          <SkeletonStatus label="Loading the brand" />
          <div aria-hidden className="flex items-center justify-between gap-4">
            <Skeleton width={112} height={46} radius="var(--radius-sm)" />
            <span className="flex h-7.5 shrink-0 items-center rounded-md px-1.5 text-type-caption-1 font-medium text-heading-04 ring-thin ring-stroke ring-inset">
              Edit Brand DNA
            </span>
          </div>
          <SkeletonText className="font-serif text-type-title" width={160} />
          <SkeletonText className="text-type-body-small" width={240} />
          <SkeletonText className="text-type-body-small" width={140} />
        </div>
      }
    >
      <BrandColumn>
        <div aria-hidden className="flex flex-col gap-10">
          <Detail title="AI budget">
            <div className="flex flex-col gap-2">
              <div className="flex h-7 items-center gap-1">
                <span className="text-type-body-small font-medium text-heading-01">
                  This month
                </span>
                <SkeletonText className="text-type-caption-2" width={64} />
              </div>
              <SkeletonText className="text-type-caption-2" width={240} />
            </div>
          </Detail>
          <Detail title="Colours">
            <ul className="grid grid-cols-2 gap-4 sm:flex sm:justify-between sm:gap-2">
              {SWATCHES.map((swatch) => (
                <li key={swatch.name} className="flex flex-col gap-2">
                  <Label>{swatch.label}</Label>
                  <span className="flex items-center gap-2">
                    <Skeleton
                      width={65}
                      height={36}
                      radius="var(--radius-md)"
                    />
                    <span className="rounded-xsm bg-foreground-01 px-1 py-0.5">
                      <SkeletonText
                        className="text-type-body-small"
                        width={58}
                      />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Detail>
          <Detail title="Fonts">
            <ul className="flex flex-wrap gap-4">
              {["Headings", "Body"].map((label) => (
                <li key={label} className="flex flex-col gap-2">
                  <Label>{label}</Label>
                  <span className="inline-flex rounded-md bg-foreground-01 p-2">
                    <SkeletonText className="text-type-body-small" width={88} />
                  </span>
                </li>
              ))}
            </ul>
          </Detail>
          <Detail title="Voice">
            <div className="flex flex-col gap-3">
              <div>
                <SkeletonText className="text-type-body-small" width="100%" />
                <SkeletonText className="text-type-body-small" width="70%" />
              </div>
              <ul className="flex flex-wrap gap-2">
                {[180, 140].map((width) => (
                  <li
                    key={width}
                    className="inline-flex rounded-md bg-foreground-01 p-2"
                  >
                    <SkeletonText
                      className="text-type-body-small"
                      width={width}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </Detail>
        </div>
      </BrandColumn>
    </BrandFrame>
  );
}

function Detail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-type-body-large leading-normal font-medium text-heading-01">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-type-body-small font-medium text-heading-03">
      {children}
    </span>
  );
}

/** A Foreground-01 chip: 8 px corners and 8 px in (fonts, voice lines); 4 px corners for hex codes. */
function Chip({
  size = "text",
  children,
}: {
  size?: "text" | "hex";
  children: ReactNode;
}) {
  return (
    <span
      className={
        size === "hex"
          ? "rounded-xsm bg-foreground-01 px-1 py-0.5 text-type-body-small font-medium text-heading-04"
          : "inline-flex max-w-full rounded-md bg-foreground-01 p-2 text-type-body-small font-medium text-heading-04"
      }
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-type-body-small font-medium text-heading-05">
      {children}
    </p>
  );
}
