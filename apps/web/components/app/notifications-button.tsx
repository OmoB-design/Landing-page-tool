"use client";

import { formatDistanceToNowStrict } from "date-fns";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HeaderBellIcon } from "@/components/ui/lp-icons";
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

import { HEADER_POPOVER, HEADER_POPOVER_TITLE } from "./job-tray";

/**
 * Notifications in the page header (BUILD_SPEC §15; Figma: Icon/Bell, Icon/Bell active and
 * Notification): a 16 px bell in a 32 px box with a blue dot while anything is unread, and a
 * popover of the latest notifications (a blue dot on unread ones, the title in 12 px medium and
 * the time in 11 px) with Mark all as read.
 */
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
            <button
              type="button"
              aria-label={label}
              className="relative flex size-8 items-center justify-center rounded-sm text-icon-system outline-none hover:bg-foreground-02 hover:text-icon-nav-active focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground-01 aria-expanded:text-icon-nav-active"
            >
              <HeaderBellIcon className="size-4" />
              {unread > 0 ? (
                <span
                  aria-hidden
                  data-dot
                  className="absolute top-2 left-4.5 size-1 rounded-full bg-spot-500-blue"
                />
              ) : null}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={HEADER_POPOVER}
      >
        <h2 className={HEADER_POPOVER_TITLE}>Notification</h2>
        {isPending ? (
          <div
            className="flex flex-col gap-2 px-3"
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
          <p className="px-3 py-2 text-type-caption-1 font-medium text-heading-05">
            No notifications yet
          </p>
        ) : (
          <div className="flex max-h-96 flex-col gap-0.5 overflow-y-auto px-3 pt-1.5 pb-1.5">
            {notifications.map((note) => {
              const isUnread = note.read_at === null;
              return (
                <DropdownMenuItem
                  key={note.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    if (isUnread) markRead.mutate([note.id]);
                  }}
                  className="items-start gap-0.5 rounded-xsm p-0 focus:bg-foreground-02"
                >
                  <span aria-hidden className="relative h-3 w-1 shrink-0">
                    {isUnread ? (
                      <span className="absolute bottom-0 left-0 size-1 rounded-full bg-spot-500-blue" />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 px-1 pt-1 pb-1.5 divider-b-half">
                    <span className="truncate text-type-caption-1 font-medium text-heading-01">
                      {isUnread ? (
                        <span className="sr-only">Unread: </span>
                      ) : null}
                      {note.title}
                    </span>
                    {note.body ? (
                      <span className="truncate text-type-caption-2 text-heading-05">
                        {note.body}
                      </span>
                    ) : null}
                    <time
                      dateTime={note.created_at}
                      className="text-type-caption-2 text-heading-05"
                    >
                      {formatDistanceToNowStrict(new Date(note.created_at), {
                        addSuffix: true,
                      })}
                    </time>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
        <DropdownMenuItem
          disabled={unread === 0}
          onSelect={() => markRead.mutate(undefined)}
          className="rounded-none py-2 pr-1 pl-3 text-type-caption-1 font-medium text-heading-01 focus:bg-foreground-02 focus:text-heading-01"
        >
          Mark all as read
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
