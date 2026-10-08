"use client";

import { formatDistanceToNowStrict } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BellIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useMarkNotificationsRead,
  useNotifications,
} from "@/lib/queries/notifications";
import { cn } from "@/lib/utils";

/** Notifications bell (BUILD_SPEC §15): unread dot, latest notifications, mark as read. */
export function NotificationsButton() {
  const { data, isPending } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;
  const label =
    unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              className="relative"
            >
              <BellIcon aria-hidden />
              {unread > 0 ? (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 size-2 rounded-full bg-accent ring-2 ring-canvas"
                />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {isPending ? (
          <div
            className="flex flex-col gap-2 p-2"
            aria-label="Loading notifications"
          >
            <Skeleton
              height="calc(var(--spacing) * 10)"
              radius="var(--radius-sm)"
            />
            <Skeleton
              height="calc(var(--spacing) * 10)"
              radius="var(--radius-sm)"
            />
          </div>
        ) : notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-fg-muted">
            No notifications yet
          </p>
        ) : (
          notifications.map((note) => {
            const isUnread = note.read_at === null;
            return (
              <DropdownMenuItem
                key={note.id}
                onSelect={() => {
                  if (isUnread) markRead.mutate([note.id]);
                }}
                className="flex items-start gap-2 py-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    isUnread ? "bg-accent" : "bg-transparent",
                  )}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("text-base", isUnread && "font-medium")}>
                    {isUnread ? (
                      <span className="sr-only">Unread: </span>
                    ) : null}
                    {note.title}
                  </span>
                  {note.body ? (
                    <span className="text-sm text-fg-muted">{note.body}</span>
                  ) : null}
                  <time
                    dateTime={note.created_at}
                    className="text-xs text-fg-subtle"
                  >
                    {formatDistanceToNowStrict(new Date(note.created_at), {
                      addSuffix: true,
                    })}
                  </time>
                </span>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={unread === 0}
          onSelect={() => markRead.mutate(undefined)}
        >
          Mark all as read
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
