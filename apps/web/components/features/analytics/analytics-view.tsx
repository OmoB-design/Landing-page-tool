import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { formatCost } from "@/components/app/row-meta";
import { SkeletonStatus, SkeletonText } from "@/components/app/skeletons";
import {
  PUBLISHED_14,
  StatusGlyph,
  type StatusGlyphKind,
} from "@/components/app/status-glyph";
import { AnalyticsIcon } from "@/components/ui/icons";
import { STATUS_GROUPS } from "@/lib/pages/list";
import { cn } from "@/lib/utils";
import type {
  Analytics,
  AnalyticsRange,
  Share,
} from "@/lib/validators/analytics";

import {
  type SpendColumn,
  SpendChart,
  SpendChartSkeleton,
} from "./spend-chart";

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "12m", label: "12 months" },
];
const BUCKET_LABEL = { day: "By day", week: "By week", month: "By month" };
const STATUS_LABEL = new Map(
  STATUS_GROUPS.flatMap((group) =>
    group.statuses.map((status) => [status as string, group.label] as const),
  ),
);
const SHOWN = 6;

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function period(start: string, bucket: Analytics["bucket"]) {
  const date = new Date(`${start}T00:00:00Z`);
  if (bucket === "month") return MONTH.format(date);
  return bucket === "week" ? `w/c ${DAY.format(date)}` : DAY.format(date);
}

/**
 * /analytics (BUILD_SPEC §14; no Figma frame yet, drawn like Pages with the dataviz method, D93):
 * the period (30 days, 90 days, 12 months) above everything it scopes; four figures (spend, pages
 * built, average cost per page, published); spend over time; spend by brand, template and kind,
 * and pages by status, each as one-hue bars with the value at the tip.
 */
export function AnalyticsView({ data }: { data: Analytics | null }) {
  return (
    <>
      <PageHeader icon={AnalyticsIcon} title="Analytics" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-6 px-6 py-12">
        <AnalyticsTitle />
        {data === null ? (
          <p className="py-16 text-center text-type-body-small font-medium text-heading-05">
            We couldn’t load analytics. Refresh and try again.
          </p>
        ) : (
          <Loaded data={data} />
        )}
      </div>
    </>
  );
}

function Loaded({ data }: { data: Analytics }) {
  const columns: SpendColumn[] = data.spend_over_time.map((point) => ({
    label: period(point.start, data.bucket),
    spendUsd: point.spend_usd,
  }));
  const statusMax = Math.max(1, ...data.pages_by_status.map((s) => s.count));
  return (
    <>
      <RangeSwitch current={data.range} />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="AI spend" value={formatCost(data.spend_usd)} />
        <Figure label="Pages built" value={String(data.pages_built)} />
        <Figure
          label="Average cost per page"
          value={
            data.average_page_cost_usd === null
              ? "—"
              : formatCost(data.average_page_cost_usd)
          }
        />
        <Figure label="Published" value={String(data.pages_published)} />
      </dl>
      <Card title="Spend over time" note={BUCKET_LABEL[data.bucket]}>
        <SpendChart columns={columns} />
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="By brand">
          <Bars shares={data.by_brand} />
        </Card>
        <Card title="By template">
          <Bars shares={data.by_template} />
        </Card>
        <Card title="By kind of call">
          <Bars shares={data.by_kind} />
        </Card>
        <Card title="Pages by status">
          {data.pages_by_status.length === 0 ? (
            <Empty>No pages built in this period</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.pages_by_status.map((row) => (
                <BarRow
                  key={row.status}
                  label={
                    <span className="flex min-w-0 items-center gap-1">
                      <StatusGlyph
                        status={
                          (row.status === "queued"
                            ? "building"
                            : row.status) as StatusGlyphKind
                        }
                        {...(row.status === "published" ? PUBLISHED_14 : {})}
                      />
                      <span className="truncate">
                        {STATUS_LABEL.get(row.status) ?? row.status}
                      </span>
                    </span>
                  }
                  share={row.count / statusMax}
                  value={String(row.count)}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function AnalyticsTitle() {
  return (
    <div className="flex flex-col gap-1.5 pr-1 pb-2">
      <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
        Analytics
      </h1>
      <p className="text-type-body-small leading-5 font-medium text-sub-text">
        What your workspace spent on AI, and what it built.
      </p>
    </div>
  );
}

/** The period, as the Desktop / Phone switch draws a choice: links, so it lives in the URL. */
function RangeSwitch({ current }: { current: AnalyticsRange }) {
  return (
    <nav aria-label="Period" className="flex">
      <div className="flex rounded-sm bg-foreground-01 p-0.5">
        {RANGES.map((range) => (
          <Link
            key={range.id}
            href={
              range.id === "30d" ? "/analytics" : `/analytics?range=${range.id}`
            }
            aria-current={range.id === current ? "page" : undefined}
            data-current={range.id === current ? "" : undefined}
            scroll={false}
            className="rounded-xsm px-2.5 py-0.5 text-type-body-small font-medium text-heading-05 outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring data-current:bg-surface-primary data-current:text-heading-01 data-current:shadow-light"
          >
            {range.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** A figure (the dataviz stat tile): a sentence-case label and a semibold value. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-panel p-4 edge">
      <dt className="text-type-caption-1 font-medium text-heading-05">
        {label}
      </dt>
      <dd className="text-type-h4 font-semibold text-heading-01">{value}</dd>
    </div>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-panel p-4 edge">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-type-body-small font-medium text-heading-01">
          {title}
        </h2>
        {note ? (
          <span className="text-type-caption-1 text-heading-05">{note}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Spend shares as one-hue bars, largest first; past six, the rest fold into Other. */
function Bars({ shares }: { shares: Share[] }) {
  if (shares.length === 0) return <Empty>No spend in this period</Empty>;
  const rows =
    shares.length > SHOWN
      ? [
          ...shares.slice(0, SHOWN - 1),
          {
            key: "other",
            label: `Other (${shares.length - SHOWN + 1})`,
            spend_usd: shares
              .slice(SHOWN - 1)
              .reduce((sum, share) => sum + share.spend_usd, 0),
          },
        ]
      : shares;
  const max = Math.max(...rows.map((row) => row.spend_usd));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <BarRow
          key={row.key}
          label={<span className="truncate">{row.label}</span>}
          share={max > 0 ? row.spend_usd / max : 0}
          value={formatCost(row.spend_usd)}
        />
      ))}
    </ul>
  );
}

function BarRow({
  label,
  share,
  value,
}: {
  label: ReactNode;
  share: number;
  value: string;
}) {
  return (
    <li className="grid grid-cols-5 items-center gap-3 text-type-caption-1">
      <span className="col-span-2 flex min-w-0 text-heading-02">{label}</span>
      <span className="col-span-3 flex min-w-0 items-center gap-2">
        <span
          className="h-3 rounded-r-xsm bg-spot-500-indigo"
          style={{ width: `${Math.max(share * 80, share > 0 ? 1 : 0)}%` }}
        />
        <span className="shrink-0 text-heading-05 tabular-nums">{value}</span>
      </span>
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className={cn("py-6 text-center text-type-caption-1 text-heading-05")}>
      {children}
    </p>
  );
}

/**
 * Analytics while it loads, measured against the loaded page (2026-10-31): the period switch
 * (30 days, the default), the four figures with their labels, the chart with its grid and axes,
 * and the four breakdown cards with their titles over three bar rows each.
 */
export function AnalyticsViewSkeleton() {
  return (
    <>
      <PageHeader icon={AnalyticsIcon} title="Analytics" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-6 px-6 py-12">
        <SkeletonStatus label="Loading analytics" />
        <AnalyticsTitle />
        <div inert>
          <RangeSwitch current="30d" />
        </div>
        <dl aria-hidden className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            "AI spend",
            "Pages built",
            "Average cost per page",
            "Published",
          ].map((label) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-panel p-4 edge"
            >
              <dt className="text-type-caption-1 font-medium text-heading-05">
                {label}
              </dt>
              <dd>
                <SkeletonText className="text-type-h4" width={64} />
              </dd>
            </div>
          ))}
        </dl>
        <Card title="Spend over time" note={BUCKET_LABEL.day}>
          <SpendChartSkeleton />
        </Card>
        <div aria-hidden className="grid gap-3 md:grid-cols-2">
          {[
            "By brand",
            "By template",
            "By kind of call",
            "Pages by status",
          ].map((title) => (
            <Card key={title} title={title}>
              <ul className="flex flex-col gap-2">
                {[0.9, 0.55, 0.3].map((share) => (
                  <li
                    key={share}
                    className="grid grid-cols-5 items-center gap-3 text-type-caption-1"
                  >
                    <span className="col-span-2">
                      <SkeletonText
                        className="text-type-caption-1"
                        width={88}
                      />
                    </span>
                    <span className="col-span-3">
                      <SkeletonText
                        className="text-type-caption-1"
                        width={`${share * 100}%`}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
