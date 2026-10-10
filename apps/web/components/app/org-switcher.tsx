"use client";

import { useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import type { SessionOrg } from "@/lib/auth/session";
import { switchOrg } from "@/lib/orgs/actions";

import { WorkspaceMark } from "./mark";

/** The workspace menu at the top of the sidebar: coloured mark, org name, chevron; lists the
 * user's orgs. */
export function OrgSwitcher({
  orgs,
  currentOrg,
}: {
  orgs: SessionOrg[];
  currentOrg: SessionOrg;
}) {
  const [switching, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Organisation: ${currentOrg.name}. Switch organisation`}
          className="flex h-8 min-w-0 items-center gap-2 rounded-sm px-1.5 text-md font-medium hover:bg-surface-hover"
        >
          <WorkspaceMark name={currentOrg.name} />
          <span className="truncate">{currentOrg.name}</span>
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 shrink-0 text-fg-muted"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Organisations</DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            disabled={switching}
            onSelect={() => {
              if (org.id === currentOrg.id) return;
              startTransition(async () => {
                await switchOrg(org.id);
              });
            }}
          >
            <WorkspaceMark name={org.name} />
            <span className="truncate">{org.name}</span>
            {org.id === currentOrg.id ? (
              <CheckIcon
                aria-label="Current organisation"
                className="ml-auto size-4"
              />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
