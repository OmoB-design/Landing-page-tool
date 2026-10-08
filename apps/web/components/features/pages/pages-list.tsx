import type { ReactNode } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { GroupedList, ListGroup, ListRow } from "@/components/app/grouped-list";
import {
  CostLabel,
  KeyLabel,
  OriginBadge,
  PersonAvatar,
  RelativeTime,
  ScoreChip,
} from "@/components/app/row-meta";
import { StatusGlyph } from "@/components/app/status-glyph";
import { TypeGlyph } from "@/components/app/type-glyph";
import { PagesIcon } from "@/components/ui/icons";
import {
  type PageGroup,
  type PageListItem,
  RESIDUE_MIN_SCORE,
} from "@/lib/pages/list";

import { PageRowMenu } from "./page-row-menu";

/** Pages grouped by build status, re-builds nested under their original. */
export function PagesList({ groups }: { groups: PageGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState icon={PagesIcon} title="No pages yet">
        Pages you build appear here, grouped by status.
      </EmptyState>
    );
  }
  return (
    <GroupedList label="Pages by status">
      {groups.map((group) => (
        <ListGroup
          key={group.id}
          label={group.label}
          count={group.count}
          glyph={<StatusGlyph status={group.id} />}
        >
          {group.rows.map((row) => (
            <PageRow key={row.id} page={row}>
              {row.children.length > 0
                ? row.children.map((child) => (
                    <PageRow key={child.id} page={child} level={1} />
                  ))
                : null}
            </PageRow>
          ))}
        </ListGroup>
      ))}
    </GroupedList>
  );
}

function PageRow({
  page,
  level = 0,
  children,
}: {
  page: PageListItem;
  level?: 0 | 1;
  children?: ReactNode;
}) {
  const href = `/pages/${page.id}`;
  return (
    <ListRow
      href={href}
      title={page.title}
      level={level}
      leading={
        <>
          <TypeGlyph type={page.templateType} />
          <KeyLabel>{page.key}</KeyLabel>
        </>
      }
      meta={
        <>
          {page.residueScore !== null ? (
            <ScoreChip score={page.residueScore} min={RESIDUE_MIN_SCORE} />
          ) : null}
          <OriginBadge origin={page.origin} />
          <CostLabel costUsd={page.costUsd} />
          <RelativeTime date={page.updatedAt} />
          <PersonAvatar name={page.createdBy.name} />
        </>
      }
      actions={<PageRowMenu pageKey={page.key} href={href} />}
    >
      {children}
    </ListRow>
  );
}
