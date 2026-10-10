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

/** Notifications (BUILD_SPEC §15): unread count, latest notifications, mark as read. The default
 * is a bell button; `variant="row"` is the sidebar row (D67). */
export function NotificationsButton({
  variant = "icon",
}: {
  variant?: "icon" | "row";
}) {
  const { data, isPending } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;
  const label =
    unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  const trigger =
    variant === "row" ? (
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex h-nav-item w-full items-center gap-2 rounded-sm px-2 text-type-body-small text-body outline-none hover:bg-foreground-02 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground-02"
        >
          <BellIcon aria-hidden className="size-4 shrink-0 text-sub-text" />
          <span className="truncate">Notifications</span>
          {unread > 0 ? (
            <span
              aria-hidden
              className="ml-auto rounded-xsm bg-foreground-02 px-1.5 text-type-caption-1 text-sub-text tabular-nums"
            >
              {unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
    ) : (
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
                  className="absolute top-1 right-1 size-2 rounded-full bg-spot-500-indigo ring-2 ring-dashboard"
                />
              ) : null}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );

  return (
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent
        side={variant === "row" ? "right" : "bottom"}
        align="start"
        className="w-80"
      >
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
          <p className="px-2 py-6 text-center text-type-caption-1 text-sub-text">
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
                    isUnread ? "bg-spot-500-indigo" : "bg-transparent",
                  )}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-type-body-small",
                      isUnread && "font-medium",
                    )}
                  >
                    {isUnread ? (
                      <span className="sr-only">Unread: </span>
                    ) : null}
                    {note.title}
                  </span>
                  {note.body ? (
                    <span className="text-type-caption-1 text-sub-text">
                      {note.body}
                    </span>
                  ) : null}
                  <time
                    dateTime={note.created_at}
                    className="text-type-caption-2 text-caption-1"
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
