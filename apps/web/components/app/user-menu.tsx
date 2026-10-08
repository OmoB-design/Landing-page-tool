"use client";

import { useTransition } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "@/components/ui/icons";
import { signOut } from "@/lib/auth/actions";
import { isThemePreference } from "@/lib/preferences";

import { setThemePreference, useThemePreference } from "./theme-preference";

function initials(name: string) {
  const letters = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase());
  return letters.join("") || "?";
}

/** Avatar menu: who is signed in, light/dark/system theme, sign out. */
export function UserMenu({ name, email }: { name: string; email: string }) {
  const theme = useThemePreference();
  const [signingOut, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className="rounded-full hover:opacity-80"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-surface-active text-xs font-medium text-fg">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-base font-medium text-fg">{name}</span>
          <span className="truncate text-sm font-normal text-fg-muted">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-sm font-normal text-fg-muted">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isThemePreference(value)) setThemePreference(value);
          }}
        >
          <DropdownMenuRadioItem value="light">
            <SunIcon aria-hidden />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon aria-hidden />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon aria-hidden />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={() =>
            startTransition(async () => {
              await signOut();
            })
          }
        >
          <LogOutIcon aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
