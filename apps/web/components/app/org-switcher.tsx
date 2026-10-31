"use client";

import Link from "next/link";
import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckIcon } from "@/components/ui/icons";
import { MenuChevronIcon } from "@/components/ui/lp-icons";
import { signOut } from "@/lib/auth/actions";
import type { SessionOrg } from "@/lib/auth/session";
import { switchOrg } from "@/lib/orgs/actions";
import { cn } from "@/lib/utils";

import { WorkspaceMark } from "./mark";

// Figma: Sidebar Account Option — 4 px padding, 4 px corners, 12 px medium heading-02,
// foreground-02 on hover and keyboard focus.
const ITEM =
  "gap-1 rounded-xsm p-1 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-02 focus:text-heading-02";

/**
 * The workspace menu at the top of the sidebar (Figma: User Option, Default and Hovered): the
 * workspace's 18 px mark, its name in 14 px medium and a 12 px chevron, 4 px across and 2 px down
 * in a 6 px-rounded row that fills with foreground-02 on hover or while open. The menu (Figma:
 * Sidebar Account Option) has Settings, Invite and manage members, and Logout; with more than one
 * workspace, the workspaces are listed first so you can switch.
 */
export function OrgSwitcher({
  orgs,
  currentOrg,
}: {
  orgs: SessionOrg[];
  currentOrg: SessionOrg;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Workspace: ${currentOrg.name}. Open the workspace menu`}
          className="flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <WorkspaceMark name={currentOrg.name} />
          {/* In the sidebar's rail only the mark stays (D97). */}
          <span className="flex min-w-0 rail-label items-center gap-1.5">
            <span className="truncate text-type-body-large font-medium text-heading-01">
              {currentOrg.name}
            </span>
            <MenuChevronIcon className="size-3 shrink-0 text-icon-system" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        alignOffset={0}
        sideOffset={8}
        className="flex w-menu-workspace flex-col gap-3 rounded-sm bg-surface-primary p-0.5 text-heading-02 shadow-float edge-hairline"
      >
        {orgs.length > 1 ? (
          <DropdownMenuGroup className="flex flex-col gap-0.5 pb-1.5 divider-b-thin">
            {orgs.map((org) => (
              <DropdownMenuItem
                key={org.id}
                disabled={pending}
                className={ITEM}
                onSelect={() => {
                  if (org.id === currentOrg.id) return;
                  startTransition(async () => {
                    await switchOrg(org.id);
                  });
                }}
              >
                <WorkspaceMark
                  name={org.name}
                  className="size-4 text-type-caption-1"
                />
                <span className="truncate">{org.name}</span>
                {org.id === currentOrg.id ? (
                  <CheckIcon
                    aria-label="Current workspace"
                    className="ml-auto size-3.5 text-icon-system"
                  />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : null}
        <DropdownMenuGroup className="flex flex-col gap-0.5 pb-1.5 divider-b-thin">
          <DropdownMenuItem asChild className={ITEM}>
            <Link href="/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={ITEM}>
            <Link href="/settings">Invite and manage members</Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuItem
          className={cn(ITEM)}
          onSelect={() =>
            startTransition(async () => {
              await signOut();
            })
          }
        >
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
