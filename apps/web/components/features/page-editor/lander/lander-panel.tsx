"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { CloseIcon, NewChatIcon } from "@/components/ui/icons";

import { IconButton } from "./composer-parts";
import { LanderMark } from "./lander-mark";

/** Lander's panel width: Sidekick's 356 px, fixed (the owner took its resize handle away, 2026-11-04). */
export const PANEL_WIDTH = 356;

/**
 * Lander's panel (B3.1b, D105; Sidekick's, docs/reference/sidekick-study.md): a second white panel
 * beside the page. The header holds Lander's mark and name, or the conversation's first request once
 * there is one, then Recents (the page's conversations, B3.1e), New chat (once there's a thread
 * and nothing running) and Close (⌘J). Below, the
 * thread, and the composer at the foot. 356 px wide, fixed.
 */
export function LanderPanel({
  title,
  working,
  recents,
  onNewChat,
  onClose,
  children,
}: {
  /** The conversation's first request, or null for a new one. */
  title: string | null;
  working: boolean;
  /** Recents (B3.1e): the page's conversations, opened from the header. */
  recents: ReactNode;
  onNewChat: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex h-full flex-col overflow-hidden rounded-panel bg-surface-primary edge">
        <header className="flex h-12 shrink-0 items-center gap-2 pr-2 pl-4">
          <div className="relative flex min-w-0 flex-1 items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {title ? (
                <motion.p
                  key="title"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="min-w-0 truncate text-type-body-small font-medium text-heading-02"
                >
                  {title}
                </motion.p>
              ) : (
                <motion.p
                  key="name"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-2 text-type-body-small font-medium text-heading-01"
                >
                  <LanderMark working={working} />
                  Lander
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          {recents}
          {title && !working ? (
            <IconButton label="New chat" onClick={onNewChat}>
              <NewChatIcon aria-hidden className="size-4" />
            </IconButton>
          ) : null}
          <IconButton label="Close Lander" shortcut="⌘J" onClick={onClose}>
            <CloseIcon aria-hidden className="size-4" />
          </IconButton>
        </header>
        {children}
      </div>
    </>
  );
}
