import {
  ORIGIN_OPTIONS,
  STATUS_GROUPS,
  type StatusGroupId,
} from "@/lib/pages/list";
import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];

/** The Library's filters (BUILD_SPEC §14): brand, template, status group, origin; in the URL. */
export type LibraryFilters = {
  brand: string[];
  template: string[];
  status: StatusGroupId[];
  origin: Enums["template_origin"][];
};

/** Pages shown at first, and added by Show more. */
export const LIBRARY_PAGE = 50;

const UUID = /^[0-9a-f-]{36}$/i;

function list(raw: string | string[] | undefined): string[] {
  return (Array.isArray(raw) ? raw.join(",") : (raw ?? ""))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseLibraryFilters(
  params: Record<string, string | string[] | undefined>,
): LibraryFilters {
  const statuses = STATUS_GROUPS.map((group) => group.id) as string[];
  const origins = ORIGIN_OPTIONS.map((option) => option.id) as string[];
  return {
    brand: list(params.brand).filter((id) => UUID.test(id)),
    template: list(params.template).filter((id) => UUID.test(id)),
    status: list(params.status).filter((id): id is StatusGroupId =>
      statuses.includes(id),
    ),
    origin: list(params.origin).filter((id): id is Enums["template_origin"] =>
      origins.includes(id),
    ),
  };
}

export function libraryHref(filters: LibraryFilters, show?: number): string {
  const query = new URLSearchParams();
  for (const [key, values] of Object.entries(filters))
    if (values.length) query.set(key, values.join(","));
  if (show && show > LIBRARY_PAGE) query.set("show", String(show));
  const text = query.toString();
  return text ? `/library?${text}` : "/library";
}
