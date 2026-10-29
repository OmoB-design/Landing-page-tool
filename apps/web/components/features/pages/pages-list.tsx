import type { ReactNode } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { GroupedList, ListGroup, ListRow } from "@/components/app/grouped-list";
import {
  CostLabel,
  OriginBadge,
  PersonAvatar,
  RelativeTime,
  ScoreChip,
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
} from "@/lib/pages/list";

import { PageRowMenu } from "./page-row-menu";

/**
 * Pages in their groups (status by default; Display can group by template type or creator, or
 * not at all), re-builds nested under their original. `hide` turns row details off.
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
      <PageRow key={row.id} page={row} hide={hide}>
        {row.children.length > 0
          ? row.children.map((child) => (
              <PageRow key={child.id} page={child} level={1} hide={hide} />
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

function PageRow({
  page,
  level = 0,
  hide,
  children,
}: {
  page: PageListItem;
  level?: 0 | 1;
  hide: PageProperty[];
  children?: ReactNode;
}) {
  const shows = (property: PageProperty) => !hide.includes(property);
  const href = `/pages/${page.id}`;
  return (
    <ListRow
      href={href}
      title={<PageTitle title={page.title} />}
      level={level}
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
      actions={<PageRowMenu buildId={page.id} pageKey={page.key} href={href} />}
    >
      {children}
    </ListRow>
  );
}

/**
 * "Template · Product" as Figma draws it: the two parts with a 4 px foreground-02 dot between
 * them, 6 px either side. Titles without the separator show as they are.
 */
function PageTitle({ title }: { title: string }) {
  const at = title.indexOf(" · ");
  if (at === -1) return title;
  return (
    <>
      {title.slice(0, at)}
      <span
        aria-hidden
        className="mx-1.5 inline-block size-1 rounded-full bg-foreground-02 align-middle"
      />
      <span className="sr-only">, </span>
      {title.slice(at + 3)}
    </>
  );
}
