"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, useState } from "react";

import { OriginBadge, formatCost } from "@/components/app/row-meta";
import { SkeletonText } from "@/components/app/skeletons";
import {
  PUBLISHED_14,
  StatusGlyph,
  type StatusGlyphKind,
} from "@/components/app/status-glyph";
import { GroupChevronIcon } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import { STATUS_GROUPS } from "@/lib/pages/list";
import { type LedgerEntry, ledgerSchema } from "@/lib/validators/ledger";
import { cn } from "@/lib/utils";

export type LibraryTableRow = {
  id: string;
  key: string;
  title: string;
  status: string;
  origin: "owned" | "cloned";
  costUsd: number;
  /** Formatted on the server ("28 Oct 2026"). */
  created: string;
  brand: string | null;
  template: string | null;
};

const STATUS_LABEL = new Map(
  STATUS_GROUPS.flatMap((group) =>
    group.statuses.map((status) => [status, group.label] as const),
  ),
);

function glyph(status: string): StatusGlyphKind {
  return status === "queued" ? "building" : (status as StatusGlyphKind);
}

/**
 * The Library's table (Quality's table, D92): every page with its brand, template, status, origin,
 * cost and date. A row opens to its paid calls (BUILD_SPEC §14), loaded when opened.
 */
export function LibraryTable({ rows }: { rows: LibraryTableRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Table className="min-w-200">
      <caption className="sr-only">Every page and what it cost</caption>
      <LibraryTableHeader />
      <TableBody>
        {rows.map((row) => {
          const opened = open === row.id;
          return (
            <Fragment key={row.id}>
              <TableRow className={cn(opened && "border-b-0")}>
                <TableCell>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-expanded={opened}
                      aria-label={`${opened ? "Hide" : "Show"} what ${row.key} cost`}
                      onClick={() => setOpen(opened ? null : row.id)}
                      className="flex size-5 shrink-0 items-center justify-center rounded-xsm text-icon-system outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <GroupChevronIcon
                        className={cn(
                          "transition-transform duration-150 ease-out",
                          !opened && "-rotate-90",
                        )}
                      />
                    </button>
                    <Link
                      href={`/pages/${row.id}`}
                      className="min-w-0 truncate outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="font-medium">{row.key}</span>
                      <span className="text-heading-05"> · {row.title}</span>
                    </Link>
                  </span>
                </TableCell>
                <TableCell className="truncate text-heading-05">
                  {row.brand ?? "—"}
                </TableCell>
                <TableCell className="truncate text-heading-05">
                  {row.template ?? "—"}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1 text-heading-05">
                    <StatusGlyph
                      status={glyph(row.status)}
                      {...(row.status === "published" ? PUBLISHED_14 : {})}
                    />
                    <span className="truncate">
                      {STATUS_LABEL.get(row.status as never) ?? row.status}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <OriginBadge origin={row.origin} />
                </TableCell>
                <TableCell className="text-right text-heading-05 tabular-nums">
                  {formatCost(row.costUsd)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap text-heading-05">
                  {row.created}
                </TableCell>
              </TableRow>
              {opened ? (
                <TableRow className="h-auto">
                  <TableCell colSpan={7} className="px-3 pb-3">
                    <PaidCalls buildId={row.id} />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

const TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function step(node: string | null) {
  if (!node) return "—";
  const words = node.replaceAll("_", " ");
  if (words.length <= 3) return words.toUpperCase(); // qa → QA
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function usage(entry: LedgerEntry) {
  if (entry.input_tokens !== null || entry.output_tokens !== null)
    return `${(entry.input_tokens ?? 0).toLocaleString("en-US")} in · ${(entry.output_tokens ?? 0).toLocaleString("en-US")} out`;
  if (entry.units !== null)
    return `${entry.units} ${entry.kind === "image" ? (entry.units === 1 ? "image" : "images") : "units"}`;
  return "—";
}

/** A page's paid calls, oldest first: when, the step, the kind, the model, tokens or images, cost. */
function PaidCalls({ buildId }: { buildId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["ledger", buildId],
    queryFn: () => apiFetch(`/api/builds/${buildId}/ledger`, ledgerSchema),
  });
  if (isPending)
    return (
      <div className="flex justify-center rounded-md bg-foreground-01 p-4">
        <Spinner className="size-4" label="Loading what it cost" />
      </div>
    );
  if (isError)
    return (
      <p className="rounded-md bg-foreground-01 p-3 text-type-caption-1 text-text-danger">
        Couldn’t load what this page cost. Try again.
      </p>
    );
  if (data.entries.length === 0)
    return (
      <p className="rounded-md bg-foreground-01 p-3 text-type-caption-1 text-heading-05">
        No paid calls: this page cost nothing.
      </p>
    );
  return (
    <ol className="flex flex-col rounded-md bg-foreground-01 px-3 py-1.5 text-type-caption-1">
      {data.entries.map((entry) => (
        <li
          key={entry.id}
          className="grid grid-cols-6 items-center gap-3 py-1 text-heading-05 not-last:divider-b-half"
        >
          <time dateTime={entry.created_at} className="tabular-nums">
            {TIME.format(new Date(entry.created_at))}
          </time>
          <span className="truncate font-medium text-heading-02">
            {step(entry.node)}
          </span>
          <span className="truncate capitalize">{entry.kind}</span>
          <span
            className="col-span-2 truncate"
            title={`${entry.provider} · ${entry.model}`}
          >
            {entry.provider} · {entry.model}
          </span>
          <span className="flex justify-between gap-2 tabular-nums">
            <span className="truncate">{usage(entry)}</span>
            <span className="text-heading-02">
              {entry.cost_usd === null ? "—" : formatCost(entry.cost_usd)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The columns, shared with the loading table so its frame matches exactly. */
function LibraryTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead scope="col" className="w-8/25">
          Page
        </TableHead>
        <TableHead scope="col" className="w-3/20">
          Brand
        </TableHead>
        <TableHead scope="col" className="w-3/20">
          Template
        </TableHead>
        <TableHead scope="col" className="w-3/20">
          Status
        </TableHead>
        <TableHead scope="col" className="w-2/25">
          Origin
        </TableHead>
        <TableHead scope="col" className="w-2/25 text-right">
          Cost
        </TableHead>
        <TableHead scope="col" className="w-1/10 text-right">
          Created
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

/**
 * The Library's table while it loads (measured against the loaded table, 2026-10-31): the real
 * column headers over three 40 px rows, each cell a line where its value will be.
 */
export function LibraryTableSkeleton() {
  return (
    <Table className="min-w-200" aria-hidden>
      <LibraryTableHeader />
      <TableBody>
        {[0, 1, 2].map((row) => (
          <TableRow key={row}>
            <TableCell>
              <span className="flex items-center gap-1.5">
                <span className="size-5 shrink-0" />
                <SkeletonText className="text-type-body-small" width={200} />
              </span>
            </TableCell>
            {[96, 120, 88, 48].map((width) => (
              <TableCell key={width}>
                <SkeletonText className="text-type-body-small" width={width} />
              </TableCell>
            ))}
            {[40, 72].map((width) => (
              <TableCell key={width}>
                <span className="flex justify-end">
                  <SkeletonText
                    className="text-type-body-small"
                    width={width}
                  />
                </span>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
