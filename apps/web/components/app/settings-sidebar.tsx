"use client";

import Link from "next/link";
import { type ComponentType, type ReactNode, useId } from "react";

import {
  AccountIcon,
  BackIcon,
  BillingIcon,
  MembersIcon,
  TrashIcon,
  UsageIcon,
  WorkspaceIcon,
} from "@/components/ui/icons";
import { ConnectionsFigmaIcon } from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";

import { WithPathname } from "./with-pathname";

type SettingsItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Not built yet: shown, not a link, with Soon. */
  soon?: boolean;
};

/** Every setting the platform has or will have, grouped as Quality groups its settings (D88). */
export const SETTINGS_GROUPS: { label: string; items: SettingsItem[] }[] = [
  {
    label: "Personal",
    items: [
      {
        href: "/settings/account",
        label: "Account",
        icon: AccountIcon,
        soon: true,
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings/general", label: "General", icon: WorkspaceIcon },
      {
        href: "/settings/members",
        label: "Members",
        icon: MembersIcon,
        soon: true,
      },
      { href: "/settings/usage", label: "Usage", icon: UsageIcon, soon: true },
      {
        href: "/settings/billing",
        label: "Billing",
        icon: BillingIcon,
        soon: true,
      },
      { href: "/settings/trash", label: "Trash", icon: TrashIcon, soon: true },
    ],
  },
  {
    label: "Tools",
    items: [
      {
        href: "/settings/connections",
        label: "Connections",
        icon: ConnectionsFigmaIcon,
      },
    ],
  },
];

const ROW =
  "flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-type-body-small leading-5 font-medium outline-none";

/**
 * The settings sidebar (D88; Quality's settings layout): in place of the app's sidebar while a
 * settings page is open. Back to app at the top, then Personal, Workspace and Tools, each a small
 * label over its rows (the rows look like the app sidebar's). Settings that aren't built yet show
 * Soon and don't open.
 */
export function SettingsSidebar() {
  const id = useId();
  return (
    <div className="flex h-full w-full flex-col gap-5 px-2 py-3">
      <Link
        href="/home"
        className={cn(
          ROW,
          "text-heading-04 hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <BackIcon aria-hidden className="size-4 shrink-0 text-icon-system" />
        Back to app
      </Link>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p
            id={`${id}-${group.label}`}
            className="px-1.5 py-1 text-type-caption-1 font-medium text-heading-05"
          >
            {group.label}
          </p>
          <nav
            aria-labelledby={`${id}-${group.label}`}
            className="flex flex-col gap-0.5"
          >
            {group.items.map((item) => (
              <SettingsLink key={item.href} item={item} />
            ))}
          </nav>
        </div>
      ))}
    </div>
  );
}

function SettingsLink({ item }: { item: SettingsItem }) {
  const ItemIcon = item.icon;
  if (item.soon) {
    return (
      <span aria-disabled className={cn(ROW, "cursor-default text-heading-05")}>
        <ItemIcon aria-hidden className="size-4 shrink-0 text-icon-system" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="rounded-sm bg-foreground-02 px-1.5 text-type-caption-2 text-heading-05">
          Soon
        </span>
      </span>
    );
  }
  const row = (active: boolean) => (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        ROW,
        "text-heading-04 hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-foreground-02 text-heading-03",
      )}
    >
      <ItemIcon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          active ? "text-icon-nav-active" : "text-icon-system",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
  return (
    <WithPathname fallback={row(false)}>
      {(pathname) => row(pathname === item.href)}
    </WithPathname>
  );
}

/** The app's sidebar, or the settings sidebar on a settings page (D88). */
export function ShellSidebar({ children }: { children: ReactNode }) {
  return (
    <WithPathname fallback={children}>
      {(pathname) =>
        pathname === "/settings" || pathname.startsWith("/settings/") ? (
          <SettingsSidebar />
        ) : (
          children
        )
      }
    </WithPathname>
  );
}
