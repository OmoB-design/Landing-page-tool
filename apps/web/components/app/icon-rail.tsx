"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

import {
  RAIL_SECTIONS,
  type RailSection,
  SETTINGS_SECTION,
  type SectionId,
  sectionFor,
} from "./navigation";
import { WithPathname } from "./with-pathname";

/** The 64 px rail of app sections (DESIGN.md §2): icon over label, active on a soft square. */
export function IconRail() {
  return (
    <nav
      aria-label="Sections"
      className="flex w-rail shrink-0 flex-col items-center gap-1 py-2"
    >
      <WithPathname fallback={<RailItems active={null} />}>
        {(pathname) => <RailItems active={sectionFor(pathname).id} />}
      </WithPathname>
    </nav>
  );
}

function RailItems({ active }: { active: SectionId | null }) {
  return (
    <>
      {RAIL_SECTIONS.map((section) => (
        <RailItem
          key={section.id}
          section={section}
          active={section.id === active}
        />
      ))}
      <div className="mt-auto flex flex-col items-center gap-1">
        <div role="separator" aria-hidden className="mb-1 h-px w-8 bg-border" />
        <RailItem section={SETTINGS_SECTION} active={active === "settings"} />
      </div>
    </>
  );
}

function RailItem({
  section,
  active,
}: {
  section: RailSection;
  active: boolean;
}) {
  const Icon = section.icon;
  return (
    <Link
      href={section.href}
      aria-current={active ? "page" : undefined}
      className="group flex w-14 flex-col items-center gap-0.5 rounded-md py-1 text-xs text-fg-muted hover:text-fg"
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-md group-hover:bg-surface-hover",
          active && "bg-surface-active text-fg group-hover:bg-surface-active",
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <span className={cn(active && "font-medium text-fg")}>
        {section.label}
      </span>
    </Link>
  );
}
