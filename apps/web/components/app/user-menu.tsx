"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ExpandIcon,
  MenuArrowIcon,
  MenuLogoutIcon,
  MenuSettingsIcon,
  MenuThemesIcon,
} from "@/components/ui/lp-icons";
import { signOut } from "@/lib/auth/actions";
import type { ThemePreference } from "@/lib/preferences";

import { PersonMark } from "./mark";
import { setThemePreference, useThemePreference } from "./theme-preference";

export type UserMenuSetup = {
  done: number;
  total: number;
  nextLabel?: string;
  nextHref?: string;
};

const THEME_ORDER: ThemePreference[] = ["system", "light", "dark"];
const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

// Figma: Sidebar Menu Option rows — 4 px across, 6 px down, 4 px corners, 16 px icon, 4 px gap,
// 12 px medium heading-02, foreground-02 on hover and keyboard focus.
const ITEM =
  "gap-1 rounded-xsm px-1 py-1.5 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-02 focus:text-heading-02 [&_svg]:size-4 [&_svg]:text-icon-system";

/**
 * The profile card at the bottom of the sidebar (Figma: Profile Nav) and its account menu
 * (Figma: Sidebar Menu Option). The card: a 30 px avatar, the name in 12 px and the email in
 * 10 px, and the up-down chevrons, 6 px inside a 10 px-rounded card stroked like the content
 * panel (a 0.5 px Border-on-bg stroke, no shadow; the stroke deepens on hover). The menu (Figma: My Pages, the open account menu) opens above it, on the
 * pop shadow with a 0.7 px stroke outline: who is signed in, Settings, Themes (cycles System →
 * Light → Dark; the badge shows the current one), Logout, then getting-started progress, 4 px in,
 * and the next step, a 4 px-padded row that fills foreground-01 on hover and focus.
 */
export function UserMenu({
  name,
  email,
  setup,
}: {
  name: string;
  email: string;
  setup: UserMenuSetup;
}) {
  const router = useRouter();
  const theme = useThemePreference();
  const [, startTransition] = useTransition();
  const percent = setup.total > 0 ? (setup.done / setup.total) * 100 : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className="flex w-full items-center gap-2.5 rounded-lg bg-surface-primary p-1.5 text-left outline-none edge hover:edge-strong focus-visible:ring-2 focus-visible:ring-ring aria-expanded:edge-strong"
        >
          <PersonMark name={name} />
          <span className="flex min-w-0 flex-1 flex-col font-medium">
            <span className="truncate text-type-caption-1 text-heading-01">
              {name}
            </span>
            <span className="truncate text-type-caption-3 text-heading-04">
              {email}
            </span>
          </span>
          <ExpandIcon className="size-4 shrink-0 text-icon-system" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        alignOffset={-2}
        sideOffset={6}
        className="flex w-menu-account flex-col gap-3 rounded-md bg-surface-primary px-1.5 pt-1.5 pb-3.5 shadow-float edge-hairline"
      >
        <DropdownMenuLabel className="flex items-center gap-2.5 p-0 font-medium">
          <PersonMark name={name} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-type-caption-1 text-heading-01">
              {name}
            </span>
            <span className="truncate text-type-caption-3 text-heading-04">
              {email}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuGroup className="flex flex-col gap-0.5 pb-1.5 divider-b-thin">
          <DropdownMenuItem
            className={ITEM}
            onSelect={() => router.push("/settings")}
          >
            <MenuSettingsIcon />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            className={`${ITEM} justify-between`}
            onSelect={(event) => {
              // Stay open, so the badge shows the new theme.
              event.preventDefault();
              setThemePreference(
                THEME_ORDER[
                  (THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length
                ]!,
              );
            }}
          >
            <span className="flex items-center gap-1">
              <MenuThemesIcon />
              Themes
            </span>
            <span className="rounded-lg bg-foreground-01 px-1.5 py-0.5 text-type-caption-3 font-medium text-heading-05">
              {THEME_LABELS[theme]}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={ITEM}
            onSelect={() =>
              startTransition(async () => {
                await signOut();
              })
            }
          >
            <MenuLogoutIcon />
            Logout
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 px-1">
            <div className="flex items-center justify-between font-medium">
              <span className="text-type-caption-1 text-heading-01">
                Getting Started
              </span>
              <span className="text-type-caption-2 text-heading-05 tabular-nums">
                {setup.done}/{setup.total}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Getting started"
              aria-valuemin={0}
              aria-valuemax={setup.total}
              aria-valuenow={setup.done}
              className="h-0.5 overflow-hidden rounded-xsm bg-foreground-02"
            >
              <div
                className="h-full bg-spot-500-blue"
                // Progress through the steps (data, not styling).
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          {setup.nextLabel && setup.nextHref ? (
            <DropdownMenuItem
              className="justify-between rounded-xsm p-1 text-type-caption-1 font-medium text-heading-01 focus:bg-foreground-01 focus:text-heading-01"
              onSelect={() => router.push(setup.nextHref!)}
            >
              <span>
                <span className="text-heading-05">Next:</span> {setup.nextLabel}
              </span>
              <MenuArrowIcon className="size-3.5 text-icon-system" />
            </DropdownMenuItem>
          ) : (
            <p className="px-1 text-type-caption-1 font-medium text-heading-05">
              All steps done.
            </p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
