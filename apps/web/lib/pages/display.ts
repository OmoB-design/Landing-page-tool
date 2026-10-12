// Pages view bar → Display: how the list is grouped and ordered, and which row details show.
// Kept in the URL like the filters (?group=type&order=cost&hide=cost,origin); defaults are left out.

export const GROUP_OPTIONS = [
  { id: "status", label: "Status" },
  { id: "type", label: "Template type" },
  { id: "creator", label: "Creator" },
  { id: "none", label: "No grouping" },
] as const;

export const ORDER_OPTIONS = [
  { id: "updated", label: "Last updated" },
  { id: "created", label: "Newest first" },
  { id: "cost", label: "Cost" },
] as const;

export const PROPERTY_OPTIONS = [
  { id: "origin", label: "Origin" },
  { id: "cost", label: "Cost" },
  { id: "updated", label: "Updated" },
  { id: "creator", label: "Creator" },
] as const;

export type PageGrouping = (typeof GROUP_OPTIONS)[number]["id"];
export type PageOrdering = (typeof ORDER_OPTIONS)[number]["id"];
export type PageProperty = (typeof PROPERTY_OPTIONS)[number]["id"];

export type PageDisplay = {
  group: PageGrouping;
  order: PageOrdering;
  /** Row details turned off; everything shows by default. */
  hide: PageProperty[];
};

export const DEFAULT_DISPLAY: PageDisplay = {
  group: "status",
  order: "updated",
  hide: [],
};

const one = <T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly { id: T }[],
  fallback: T,
): T => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return allowed.find((option) => option.id === value)?.id ?? fallback;
};

/** Reads ?group=…&order=…&hide=a,b; unknown values fall back to the defaults. */
export function parsePageDisplay(
  params: Record<string, string | string[] | undefined>,
): PageDisplay {
  const hidden = (
    Array.isArray(params.hide) ? params.hide.join(",") : (params.hide ?? "")
  ).split(",");
  return {
    group: one(params.group, GROUP_OPTIONS, DEFAULT_DISPLAY.group),
    order: one(params.order, ORDER_OPTIONS, DEFAULT_DISPLAY.order),
    hide: PROPERTY_OPTIONS.map((option) => option.id).filter((id) =>
      hidden.includes(id),
    ),
  };
}

/** How many choices differ from the defaults (shown on the Display button). */
export function changedDisplayCount(display: PageDisplay): number {
  return (
    Number(display.group !== DEFAULT_DISPLAY.group) +
    Number(display.order !== DEFAULT_DISPLAY.order) +
    display.hide.length
  );
}

/** Adds the non-default display choices to a URL's search params. */
export function setDisplayParams(
  params: URLSearchParams,
  display: PageDisplay,
): void {
  if (display.group !== DEFAULT_DISPLAY.group)
    params.set("group", display.group);
  if (display.order !== DEFAULT_DISPLAY.order)
    params.set("order", display.order);
  if (display.hide.length > 0) params.set("hide", display.hide.join(","));
}
