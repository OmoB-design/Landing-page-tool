import { SkeletonStatus, SkeletonText } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import {
  ChevronUpIcon,
  MonitorIcon,
  PagesIcon,
  PhoneIcon,
} from "@/components/ui/icons";
import {
  BackArrowFigmaIcon,
  RedoFigmaIcon,
  UndoFigmaIcon,
} from "@/components/ui/lp-icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { cn } from "@/lib/utils";

// The pill tab (components/ui/tabs.tsx), drawn without Radix since nothing can be chosen yet.
const TAB =
  "inline-flex h-7 items-center rounded-sm px-2.5 text-type-body-small whitespace-nowrap text-sub-text";

/**
 * The section editor while the template loads, measured against the loaded editor (2026-10-31):
 * the top bar with back, the name and saved state as lines, Undo, Redo and Create a page as they
 * are (waiting); the panel with its tabs, the Selected section and Whole template groups (their
 * titles real; the first section's name, details, a one-line and a two-line field, as a library
 * template's first section has; the rows 40 px apart);
 * and the preview's Desktop / Phone switch and read time over the empty well. Out of reach until
 * the editor arrives. A cloned template adds Rules to the tabs.
 */
export function EditorSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkeletonStatus label="Loading the template" />
      <div
        inert
        aria-hidden
        className="flex h-topbar shrink-0 items-center gap-3 bg-surface-primary px-3 divider-b-half sm:px-4"
      >
        <Button variant="ghost" size="icon-sm" tabIndex={-1}>
          <BackArrowFigmaIcon className="text-icon-nav-active" />
        </Button>
        <SkeletonText className="text-type-body-small" width={168} />
        <span className="hidden sm:flex">
          <SkeletonText className="text-type-caption-1" width={104} />
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-sub-text opacity-50"
          >
            <UndoFigmaIcon className="size-3.5 text-icon-system" />
            <span className="sr-only sm:not-sr-only">Undo</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-sub-text opacity-50"
          >
            <RedoFigmaIcon className="size-4 text-icon-system" />
            <span className="sr-only sm:not-sr-only">Redo</span>
          </Button>
          <Button size="sm" className="ml-1 opacity-50">
            <PagesIcon />
            <span className="sr-only sm:not-sr-only">Create a page</span>
          </Button>
        </span>
      </div>
      <div
        inert
        aria-hidden
        className="flex min-h-0 flex-1 flex-col lg:flex-row"
      >
        <div className="h-1/2 shrink-0 border-b border-stroke bg-surface-primary lg:h-auto lg:w-editor-panel lg:border-b-0 lg:divider-r-thin">
          <div className="flex items-center gap-1 px-4 py-2.5 divider-b-thin">
            {["Content", "Look", "Details", "Issues"].map((tab) => (
              <span
                key={tab}
                className={cn(
                  TAB,
                  tab === "Content" && "bg-foreground-02 font-medium text-body",
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2 p-4">
            <Group title="Selected section">
              <div className="flex flex-col gap-3">
                <div className="flex h-7 items-center gap-2">
                  <SkeletonText className="text-type-body-small" width={96} />
                  <SkeletonText className="text-type-caption-1" width={84} />
                </div>
                <SkeletonText className="text-type-caption-1" width={112} />
                <div className="flex flex-col gap-1.5">
                  <Skeleton height={34} radius="var(--radius-md)" />
                  <Skeleton height={56} radius="var(--radius-md)" />
                </div>
                {/* At the panel's 360 px the note runs to a second line. */}
                <div>
                  <SkeletonText className="text-type-caption-1" width={300} />
                  <SkeletonText className="text-type-caption-1" width={32} />
                </div>
              </div>
            </Group>
            <Group
              title={
                <span className="flex items-center gap-1">
                  Whole template ·
                  <SkeletonText className="text-type-body-small" width={72} />
                </span>
              }
            >
              <div className="flex flex-col gap-1">
                {(
                  [
                    [56, 120],
                    [40, 140],
                    [56, 104],
                    [64, 88],
                    [80, 112],
                    [56, 96],
                  ] as const
                ).map(([role, name]) => (
                  <div
                    key={`${role}-${name}`}
                    className="flex h-9 items-center justify-between gap-3 rounded-md bg-foreground-01 pr-2.5 pl-6.5"
                  >
                    <SkeletonText
                      className="text-type-caption-1"
                      width={role}
                    />
                    <SkeletonText
                      className="text-type-caption-1"
                      width={name}
                    />
                  </div>
                ))}
              </div>
            </Group>
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 lg:px-6 lg:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center rounded-md bg-foreground-03 p-0.5 ring-hair ring-stroke ring-inset dark:bg-foreground-01 dark:ring-0">
              {(
                [
                  ["Desktop", MonitorIcon],
                  ["Phone", PhoneIcon],
                ] as const
              ).map(([label, ViewIcon]) => (
                <span
                  key={label}
                  className={cn(
                    "inline-flex h-6.5 items-center gap-1 rounded-sm border border-transparent px-1.5 text-type-caption-1 font-medium text-heading-02 dark:text-sub-text",
                    label === "Desktop" &&
                      "bg-surface-primary dark:bg-letter-paper dark:text-body dark:shadow-sm",
                  )}
                >
                  <ViewIcon
                    className={cn(
                      "size-3.5",
                      label === "Desktop"
                        ? "text-stroke-input-active"
                        : "text-icon-system",
                    )}
                  />
                  {label}
                </span>
              ))}
            </div>
            <SkeletonText className="text-type-caption-1" width={160} />
          </div>
          <div className="min-h-0 flex-1 bg-foreground-02 ring-thin ring-stroke ring-inset dark:bg-surface-modal" />
        </div>
      </div>
    </div>
  );
}

/** A panel group's frame (content-panel.tsx `Group`): a 36 px title row with its chevron. */
function Group({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-stroke pt-2 first:border-t-0 first:pt-0">
      <div className="flex h-9 w-full items-center justify-between text-type-body-small font-medium">
        {title}
        <ChevronUpIcon className="size-4 text-icon-system" />
      </div>
      <div className="pt-1 pb-2">{children}</div>
    </div>
  );
}
