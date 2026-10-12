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
import { useHydrated } from "@/lib/use-hydrated";

import {
  HEADER_POPOVER,
  HEADER_POPOVER_TITLE,
  POPOVER_FOOTER,
  POPOVER_FOOTER_ACTION,
  PopoverScroll,
} from "./header-popover";

/**
 * Notifications in the page header (BUILD_SPEC §15; Figma: Icon/Bell, Icon/Bell active and the
 * Notis component): a 16 px bell in a 32 px box with a blue dot while anything is unread, and a
 * popover of the latest notifications (a blue dot on unread ones, the title in 12 px medium, the
 * time in 11 px; a row fills Foreground-01 on hover) that fades into a "Mark all as read" footer.
 */
export function NotificationsButton() {
  const { data, isPending } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const hydrated = useHydrated();
  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;
  // The count appears after hydration, like the dot (the server has no notifications data).
  const showUnread = hydrated && unread > 0;
  const label = showUnread
    ? `Notifications, ${unread} unread`
    : "Notifications";

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
              {showUnread ? (
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
            className="flex flex-col gap-2 p-3"
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
          <p className="p-3 text-type-caption-1 font-medium text-heading-05">
            No notifications yet
          </p>
        ) : (
          <PopoverScroll>
            <div className="flex flex-col gap-0.5 px-2 py-3">
              {notifications.map((note) => {
                const isUnread = note.read_at === null;
                return (
                  <DropdownMenuItem
                    key={note.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      if (isUnread) markRead.mutate([note.id]);
                    }}
                    className="items-start gap-0.5 rounded-md px-1 py-0 focus:bg-foreground-01 dark:focus:bg-foreground-02"
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
          </PopoverScroll>
        )}
        <div className={POPOVER_FOOTER}>
          <DropdownMenuItem
            disabled={unread === 0}
            onSelect={() => markRead.mutate(undefined)}
            className={`${POPOVER_FOOTER_ACTION} focus:bg-foreground-01 focus:text-heading-01 data-disabled:text-heading-05 data-disabled:opacity-100`}
          >
            Mark all as read
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
