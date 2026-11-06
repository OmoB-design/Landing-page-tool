"use client";

import { useState } from "react";

import { ListRow } from "@/components/app/grouped-list";
import {
  CostLabel,
  PersonAvatar,
  RelativeTime,
} from "@/components/app/row-meta";
import { FolderIcon } from "@/components/ui/folder-icon";
import { MorphText } from "@/components/ui/text-morph";
import type { BatchFolder, PageListItem } from "@/lib/pages/list";

/**
 * A batch's pages as one row of the Pages list (B3.5b, owner 2026-11-06: "all grouped templates
 * should be inside the folder"): the owner's portfolio folder (no tile here; owner, 2026-11-06)
 * in the colour the team picked, a frame per page peeking out (up to three: the pages' template
 * thumbnails; it straightens and they rise as the row is hovered) and how
 * many pages, the product and brand, then how far along they are, the batch's total cost, its
 * newest change and who started it. It opens the batch's page.
 */
export function FolderRow({
  page,
  folder,
}: {
  page: PageListItem;
  folder: BatchFolder;
}) {
  const [hovered, setHovered] = useState(false);
  const stills = folder.pages
    .slice(0, 3)
    .map((p) => (p.templateId ? `/thumbs/template/${p.templateId}` : ""));
  const total = folder.pages.length;
  const progress = `${folder.ready}/${total} ready`;
  return (
    <ListRow
      href={`/pages/batch/${folder.batchId}`}
      onHoverChange={setHovered}
      // The row menu's place on a page's row (18 px), kept so the folder's details line up.
      actions={<span aria-hidden className="size-4.5" />}
      title={
        <>
          {folder.product}
          {folder.brand ? (
            <>
              <span
                aria-hidden
                className="mx-1.5 inline-block size-1 rounded-full bg-foreground-02 align-middle"
              />
              <span className="sr-only">, </span>
              {folder.brand}
            </>
          ) : null}
        </>
      }
      leading={
        <span className="flex w-23.75 shrink-0 items-center gap-1.5">
          <FolderIcon
            tone={folder.color}
            stills={stills}
            hovered={hovered}
            width={22.5}
          />
          <span className="text-type-body-small font-medium text-heading-01 tabular-nums">
            {total} pages
          </span>
        </span>
      }
      meta={
        <>
          {/* In the place and style of a page's Owned badge, so the rows line up. */}
          <span className="flex shrink-0 items-center rounded-sm px-1.5 text-type-caption-1 text-sub-text tabular-nums ring-thin ring-stroke">
            <MorphText>{progress}</MorphText>
          </span>
          <CostLabel costUsd={page.costUsd} />
          <RelativeTime date={page.updatedAt} />
          <PersonAvatar name={page.createdBy.name} />
        </>
      }
    />
  );
}
