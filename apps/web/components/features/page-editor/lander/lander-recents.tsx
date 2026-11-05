"use client";

import { WorkingDots } from "@/components/app/working-dots";
import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";

import { CheckIcon, HistoryIcon } from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgentThreadSummary } from "@/lib/validators/agent";

/**
 * Recents (B3.1e, D108; Sidekick's): this page's conversations with Lander, newest first, each
 * by its first request with how many requests and when it last moved; the open one is ticked.
 * Opening one shows it to read and continue. Off while Lander works.
 */
export function LanderRecents({
  current,
  disabled,
  onList,
  onOpen,
}: {
  current: string | null;
  disabled: boolean;
  onList: () => Promise<AgentThreadSummary[]>;
  onOpen: (threadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<AgentThreadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setFailed(false);
    onList()
      .then(setThreads)
      .catch(() => setFailed(true));
  };

  return (
    <Popover open={open} onOpenChange={load}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Recents"
              disabled={disabled}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-icon-system transition-colors duration-150 outline-none hover:bg-foreground-02 hover:text-body focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 aria-expanded:bg-foreground-02"
            >
              <HistoryIcon aria-hidden className="size-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Recents</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="flex w-menu-header flex-col gap-1 rounded-md bg-surface-primary p-1.5 text-type-caption-1 shadow-float edge-hairline"
      >
        <p className="px-2 pt-1 pb-1.5 font-medium text-heading-05">
          Conversations on this page
        </p>
        {threads === null && !failed ? (
          <div className="flex items-center gap-2 px-2 py-2 text-sub-text">
            <WorkingDots label="Loading" />
            Loading…
          </div>
        ) : failed ? (
          <p className="px-2 py-2 text-text-danger">
            Couldn’t load them. Try again.
          </p>
        ) : threads && threads.length ? (
          <ul className="flex max-h-80 flex-col overflow-y-auto">
            {threads.map((thread) => {
              const here = thread.thread_id === current;
              return (
                <li key={thread.thread_id}>
                  <button
                    type="button"
                    aria-current={here || undefined}
                    onClick={() => {
                      setOpen(false);
                      if (!here) onOpen(thread.thread_id);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring",
                      here && "bg-foreground-01",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-heading-02">
                        {thread.title || "Untitled"}
                      </span>
                      <span className="text-type-caption-2 text-heading-06">
                        {thread.requests === 1
                          ? "1 request"
                          : `${thread.requests} requests`}{" "}
                        ·{" "}
                        {formatDistanceToNowStrict(new Date(thread.last_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                    {here ? (
                      <CheckIcon
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0 text-heading-06"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 py-2 text-sub-text">
            No conversations on this page yet.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
