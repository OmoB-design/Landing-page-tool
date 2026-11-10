import type { ReactNode } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { GroupedList, ListGroup, ListRow } from "@/components/app/grouped-list";
import {
  CostLabel,
  OriginBadge,
  PersonAvatar,
  RelativeTime,
  ScoreChip,
  StatusBadge,
} from "@/components/app/row-meta";
import { StatusGlyph } from "@/components/app/status-glyph";
import { TypeGlyph } from "@/components/app/type-glyph";
import { PagesIcon } from "@/components/ui/icons";
import type { PageProperty } from "@/lib/pages/display";
import {
  type PageGroup,
  type PageGroupKey,
  type PageListItem,
  RESIDUE_MIN_SCORE,
  copyLabel,
} from "@/lib/pages/list";

import { FolderRow } from "./folder-row";
import { PageRowMenu } from "./page-row-menu";

/**
 * Pages in their groups (status by default; Display can group by template type or creator, or
 * not at all), copies hanging under their original as a tree (B7.1, D144). `hide` turns row
 * details off.
 */
export function PagesList({
  groups,
  hide = [],
}: {
  groups: PageGroup[];
  hide?: PageProperty[];
}) {
  if (groups.length === 0) {
    return (
      <EmptyState icon={PagesIcon} title="No pages yet">
        Pages you build appear here, grouped by status.
      </EmptyState>
    );
  }
  const rows = (group: PageGroup) =>
    group.rows.map((row) => (
      <PageRow key={row.id} page={row} hide={hide} nested={row.children}>
        {row.children.length > 0
          ? row.children.map((child, index) => (
              <PageRow
                key={child.id}
                page={child}
                parentOffer={row.offerName ?? null}
                level={1}
                hide={hide}
                branch={{
                  first: index === 0,
                  last: index === row.children.length - 1,
                }}
              />
            ))
          : null}
      </PageRow>
    ));
  const ungrouped = groups.length === 1 && groups[0]?.key.kind === "all";
  return (
    <GroupedList label={ungrouped ? "Pages" : "Pages by group"}>
      {ungrouped ? (
        <ul role="list" className="flex flex-col gap-0.5">
          {rows(groups[0]!)}
        </ul>
      ) : (
        groups.map((group) => (
          <ListGroup
            key={group.id}
            label={group.label}
            count={group.count}
            glyph={<GroupGlyph groupKey={group.key} />}
          >
            {rows(group)}
          </ListGroup>
        ))
      )}
    </GroupedList>
  );
}

/** A group's glyph: its status icon, template type glyph, or the creator's avatar. */
function GroupGlyph({ groupKey }: { groupKey: PageGroupKey }) {
  switch (groupKey.kind) {
    case "status":
      return <StatusGlyph status={groupKey.status} />;
    case "type":
      return <TypeGlyph type={groupKey.type} />;
    case "creator":
      return <PersonAvatar name={groupKey.name} />;
    case "all":
      return null;
  }
}

const BUILT = new Set(["needs_review", "approved", "published"]);

function PageRow({
  page,
  level = 0,
  hide,
  nested = [],
  branch,
  parentOffer = null,
  children,
}: {
  page: PageListItem;
  /** The original's offer: a copy selling another one says it (B7.3a). */
  parentOffer?: string | null;
  level?: 0 | 1;
  hide: PageProperty[];
  /** The pages hanging under this one (its copies). */
  nested?: PageListItem[];
  branch?: { first: boolean; last: boolean };
  children?: ReactNode;
}) {
  // A batch's pages as one folder row (B3.5b).
  if (page.folder) return <FolderRow page={page} folder={page.folder} />;
  const shows = (property: PageProperty) => !hide.includes(property);
  const href = `/pages/${page.id}`;
  return (
    <ListRow
      href={href}
      title={
        // Under its original, a copy is its number: the original says the rest.
        level === 1 && page.copyNumber ? (
          copyLabel(page.copyNumber, page.offerName ?? null, parentOffer)
        ) : (
          <>
            <PageTitle title={page.title} />
            <CopiesNote page={page} nested={nested} />
          </>
        )
      }
      level={level}
      branch={branch}
      fold={
        nested.length > 0
          ? {
              show: `Show the pages under ${page.key}`,
              hide: `Hide the pages under ${page.key}`,
            }
          : undefined
      }
      leading={
        // Figma: the glyph and key take the first 107 px (95 + the row's 12 px gap).
        <span className="flex w-23.75 shrink-0 items-center gap-1.5">
          <TypeGlyph type={page.templateType} size="md" />
          <span className="text-type-body-small font-medium text-heading-01">
            {page.key}
          </span>
        </span>
      }
      meta={
        <>
          {level === 1 ? <StatusBadge status={page.status} /> : null}
          {page.residueScore !== null ? (
            <ScoreChip score={page.residueScore} min={RESIDUE_MIN_SCORE} />
          ) : null}
          {shows("origin") ? <OriginBadge origin={page.origin} /> : null}
          {shows("cost") ? <CostLabel costUsd={page.costUsd} /> : null}
          {shows("updated") ? <RelativeTime date={page.updatedAt} /> : null}
          {shows("creator") ? (
            <PersonAvatar name={page.createdBy.name} />
          ) : null}
        </>
      }
      actions={
        <PageRowMenu
          buildId={page.id}
          pageKey={page.key}
          href={href}
          built={BUILT.has(page.status)}
          brandId={page.brandId ?? null}
          offerId={page.offerId ?? null}
        />
      }
    >
      {children}
    </ListRow>
  );
}

/**
 * How many copies hang under a page, after its title (B7.1): "3 copies", and how many of them
 * wait for review when the page itself doesn't (its group doesn't say so for them).
 */
function CopiesNote({
  page,
  nested,
}: {
  page: PageListItem;
  nested: PageListItem[];
}) {
  const copies = nested.filter((child) => child.copyNumber).length;
  if (copies === 0) return null;
  const waiting =
    page.status === "needs_review"
      ? 0
      : nested.filter((child) => child.status === "needs_review").length;
  return (
    <span className="ml-2 text-type-caption-1 font-normal text-sub-text tabular-nums">
      {copies === 1 ? "1 copy" : `${copies} copies`}
      {waiting > 0 ? ` · ${waiting} to review` : ""}
    </span>
  );
}

/**
 * "Template · Product" as Figma draws it: the parts with a 4 px foreground-02 dot between them,
 * 6 px either side (a copy's title has a third: "Copy 2"). Titles without the separator show as
 * they are.
 */
function PageTitle({ title }: { title: string }) {
  const parts = title.split(" · ");
  if (parts.length === 1) return title;
  return parts.map((part, index) => (
    <span key={index}>
      {index > 0 ? (
        <>
          <span
            aria-hidden
            className="mx-1.5 inline-block size-1 rounded-full bg-foreground-02 align-middle"
          />
          <span className="sr-only">, </span>
        </>
      ) : null}
      {part}
    </span>
  ));
}
