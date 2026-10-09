import {
  AnalyticsIcon,
  BrandsIcon,
  type Icon,
  LibraryIcon,
  PagesIcon,
  SettingsIcon,
  TemplatesIcon,
} from "@/components/ui/icons";

// App navigation (DESIGN.md §3): the icon rail's sections, and what the sidebar shows for each.

export type SectionId =
  "pages" | "templates" | "brands" | "library" | "analytics" | "settings";

export type RailSection = {
  id: SectionId;
  label: string;
  href: string;
  icon: Icon;
};

export const RAIL_SECTIONS: RailSection[] = [
  { id: "pages", label: "Pages", href: "/pages", icon: PagesIcon },
  {
    id: "templates",
    label: "Templates",
    href: "/templates",
    icon: TemplatesIcon,
  },
  { id: "brands", label: "Brands", href: "/brands", icon: BrandsIcon },
  { id: "library", label: "Library", href: "/library", icon: LibraryIcon },
  {
    id: "analytics",
    label: "Analytics",
    href: "/analytics",
    icon: AnalyticsIcon,
  },
];

export const SETTINGS_SECTION: RailSection = {
  id: "settings",
  label: "Settings",
  href: "/settings",
  icon: SettingsIcon,
};

const ALL_SECTIONS = [...RAIL_SECTIONS, SETTINGS_SECTION];

/** The sidebar's primary action per section; `href` once the screen it opens exists. */
export const SECTION_ACTIONS: Record<
  SectionId,
  { label: string; href?: string }
> = {
  pages: { label: "New page", href: "/pages/new" },
  templates: { label: "Browse library", href: "/templates" },
  brands: { label: "New brand", href: "/brands/new" },
  library: { label: "New page", href: "/pages/new" },
  analytics: { label: "New page", href: "/pages/new" },
  settings: { label: "New page", href: "/pages/new" },
};

/** Which rail section a path belongs to. Home lives under Pages, as in the reference layout. */
export function sectionFor(pathname: string): RailSection {
  const segment = pathname.split("/")[1] ?? "";
  return (
    ALL_SECTIONS.find((section) => section.id === segment) ?? RAIL_SECTIONS[0]!
  );
}
