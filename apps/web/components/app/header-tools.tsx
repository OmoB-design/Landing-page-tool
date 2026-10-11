"use client";

import { JobTray } from "./job-tray";
import { NotificationsButton } from "./notifications-button";
import { useInShell } from "./sidebar-state";

/** Jobs and Notifications at the right of every page header (Figma: Home — two 32 px icon
 * buttons). Renders nothing outside the app shell (e.g. a page header in a component test). */
export function HeaderTools() {
  if (!useInShell()) return null;
  return (
    <div className="flex items-center">
      <JobTray />
      <NotificationsButton />
    </div>
  );
}
