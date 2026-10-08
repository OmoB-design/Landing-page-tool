"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProfileMenu } from "@/components/ui/profile-menu";
import { signOut } from "@/lib/auth/actions";
import type { ThemePreference } from "@/lib/preferences";

import { initials } from "./row-meta";
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
const THEME_ICONS = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };

/**
 * Account menu (AffectUI profile menu in a popover): who is signed in, Settings, theme
 * (cycles System → Light → Dark), sign out, and the workspace's getting-started progress.
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
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ThemeIcon = THEME_ICONS[theme];

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className="flex size-7 items-center justify-center rounded-full bg-surface-active text-xs font-medium text-fg hover:opacity-80"
        >
          {initials(name)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 border-0 bg-transparent p-0 shadow-pop"
      >
        <ProfileMenu
          name={name}
          email={email}
          avatar={
            // An SVG keeps the initials centred: the card sizes its avatar slot as a block.
            <svg viewBox="0 0 40 40" aria-hidden>
              <circle cx="20" cy="20" r="20" className="fill-accent-soft" />
              <text
                x="20"
                y="20"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-accent text-sm font-medium"
              >
                {initials(name)}
              </text>
            </svg>
          }
          items={[
            {
              id: "settings",
              label: "Settings",
              icon: <SettingsIcon />,
              onSelect: () => go("/settings"),
            },
            {
              id: "theme",
              label: "Theme",
              icon: <ThemeIcon />,
              badge: THEME_LABELS[theme],
              onSelect: () => {
                const next =
                  THEME_ORDER[
                    (THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length
                  ]!;
                setThemePreference(next);
              },
            },
            {
              id: "sign-out",
              label: "Sign out",
              icon: <LogOutIcon />,
              onSelect: () =>
                startTransition(async () => {
                  await signOut();
                }),
            },
          ]}
          setup={{
            title: "Getting started",
            done: setup.done,
            total: setup.total,
            next: setup.nextLabel,
            onContinue: setup.nextHref ? () => go(setup.nextHref!) : undefined,
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
