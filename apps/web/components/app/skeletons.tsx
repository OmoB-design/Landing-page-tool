import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/shimmer-loader";
import { cn } from "@/lib/utils";

/*
 * Loading states in the shape of what they stand in for: the page's own frames, labels, lines and
 * spacing stay put, and only what comes from the server shimmers, sized to its type, so nothing
 * moves when it arrives.
 */

/**
 * A line of text still loading: a bar two thirds of the type's size, on that type's own line
 * height. `className` carries the type (and any line-height override), e.g. `text-type-body-small`.
 * A percentage width is of the line's container (the line then spans it, even in a row).
 */
export function SkeletonText({
  className,
  width,
}: {
  className: string;
  width: number | string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-lh items-center",
        typeof width === "string" && width.endsWith("%") && "w-full min-w-0",
        className,
      )}
    >
      <Skeleton width={width} height="0.64em" radius="var(--radius-xsm)" />
    </span>
  );
}

/** A square or round mark still loading (brand marks, product pictures, avatars), in px. */
export function SkeletonMark({
  size,
  round = false,
}: {
  size: number;
  round?: boolean;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      circle={round}
      radius="var(--radius-xsm)"
    />
  );
}

/** A button still loading, at its own height and corner (30 px, 6 px by default). */
export function SkeletonButton({
  width,
  height = 30,
  radius = "var(--radius-sm)",
}: {
  width: number | string;
  height?: number;
  radius?: string;
}) {
  return <Skeleton width={width} height={height} radius={radius} />;
}

/**
 * An Input Field whose value is still loading: the real label, the empty 42 px frame (80 px for a
 * text area) with a short line where the value goes, and the hint if the field has one.
 */
export function SkeletonField({
  label,
  hint,
  value = "45%",
  multiline = false,
}: {
  label: string;
  hint?: string;
  value?: number | string;
  multiline?: boolean;
}) {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      <span className="text-type-body-large leading-normal font-medium text-heading-01">
        {label}
      </span>
      <div
        className={cn(
          "flex rounded-lg border border-stroke bg-surface-primary px-3.5 shadow-light",
          multiline ? "h-20 items-start py-3" : "h-10.5 items-center",
        )}
      >
        <SkeletonText className="text-type-caption-1" width={value} />
      </div>
      {hint ? (
        <span className="text-type-caption-1 leading-normal text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A list row still loading (Page List, brand and product rows): the row's height and hairline,
 * `leading` (a mark, picture or key), the name, the meta on the right from md up, and room for
 * the ⋯ when the row has one.
 */
export function SkeletonRow({
  height = "h-12",
  gap = "gap-3",
  leading,
  name,
  meta = [],
  metaEnd,
  menu = false,
}: {
  height?: "h-11" | "h-12";
  gap?: "gap-2.5" | "gap-3";
  leading?: ReactNode;
  name: number | string;
  /** Widths of the meta lines, left to right. */
  meta?: (number | string)[];
  /** After the meta lines (an avatar). */
  metaEnd?: ReactNode;
  menu?: boolean;
}) {
  return (
    <li
      aria-hidden
      className={cn(
        "flex items-center gap-3 bg-surface-primary pr-4 divider-b-thin",
        height,
      )}
    >
      <span className={cn("flex min-w-0 flex-1 items-center pl-4", gap)}>
        {leading}
        <span className="min-w-0 flex-1">
          <SkeletonText className="text-type-body-small" width={name} />
        </span>
        {meta.length > 0 || metaEnd ? (
          <span className="hidden shrink-0 items-center gap-3 md:flex">
            {meta.map((width, index) => (
              <SkeletonText
                key={index}
                className="text-type-caption-1"
                width={width}
              />
            ))}
            {metaEnd}
          </span>
        ) : null}
      </span>
      {menu ? <span className="size-4.5 shrink-0" /> : null}
    </li>
  );
}

/**
 * View tabs whose counts are still loading: the real labels, 32 px apart, each with an empty count
 * pill, on the 36 px hairline bar (Pages, Templates).
 */
export function SkeletonViewTabs({
  labels,
  children,
}: {
  labels: string[];
  /** Right side of the bar (toolbar). */
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden
      className="flex h-9 items-center justify-between gap-4 divider-b-thin"
    >
      <div className="flex h-full gap-8">
        {labels.map((label) => (
          <span
            key={label}
            className="flex h-full items-center gap-1 text-type-body-small font-medium text-heading-01"
          >
            {label}
            <span className="flex h-lh min-w-5.75 items-center rounded-lg bg-foreground-01 px-1 text-type-caption-1">
              <Skeleton width={14} height="0.75em" radius="var(--radius-xsm)" />
            </span>
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

/**
 * The loader card (job steps) while its job loads: the real title, the empty bar, then each step's
 * ring and a line for its label, 12 px apart.
 */
export function SkeletonJobSteps({
  title,
  steps,
}: {
  title: string;
  steps: number;
}) {
  return (
    <div
      aria-hidden
      className="w-full max-w-90 rounded-panel edge-strong bg-surface-primary p-5 edge"
    >
      <span className="text-type-body-large leading-normal font-medium text-heading-01">
        {title}
      </span>
      <div className="mt-3 mb-4 h-1.5 rounded-xsm bg-foreground-02" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: steps }, (_, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <span className="size-5 shrink-0 rounded-full border-2 border-meta-dot" />
            <SkeletonText
              className="text-type-body-small leading-5"
              width={[184, 136, 200, 120, 160][index % 5] ?? 160}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tells screen readers the region is loading (the skeleton shapes themselves are hidden). */
export function SkeletonStatus({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="sr-only">
      {label}…
    </span>
  );
}
