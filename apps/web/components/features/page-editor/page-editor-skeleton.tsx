import {
  SkeletonButton,
  SkeletonStatus,
  SkeletonText,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/shimmer-loader";

/** The page editor while it loads, in its shape (B3.1b): the page panel with its top bar (name and
 * save status; Sections, Desktop / Phone, Undo and Redo), the page's well, and the floating bar. */
export function PageEditorSkeleton() {
  return (
    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-panel bg-surface-primary edge">
      <SkeletonStatus label="Loading the editor" />
      <div className="flex h-topbar shrink-0 items-center gap-3 px-3 divider-b-half sm:px-4">
        <SkeletonButton width={32} height={32} />
        <SkeletonText className="text-type-body-small" width={240} />
        <SkeletonText className="text-type-caption-1" width={110} />
        <div className="ml-auto flex items-center gap-1.5">
          <SkeletonButton width={92} height={28} />
          <SkeletonButton width={150} height={30} />
          <SkeletonButton width={64} height={28} />
          <SkeletonButton width={64} height={28} />
        </div>
      </div>
      <div
        aria-hidden
        className="relative flex min-h-0 flex-1 flex-col p-3 lg:p-4"
      >
        <div className="min-h-0 flex-1 bg-foreground-02 p-3 ring-thin ring-stroke ring-inset dark:bg-surface-modal">
          <Skeleton width="100%" height="100%" radius="0" />
        </div>
        <div className="absolute inset-x-4 bottom-4 flex justify-center">
          <Skeleton width={376} height={50} radius="var(--radius-max)" />
        </div>
      </div>
    </main>
  );
}
