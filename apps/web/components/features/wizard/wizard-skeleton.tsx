import {
  SkeletonButton,
  SkeletonStatus,
  SkeletonText,
} from "@/components/app/skeletons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { WIZARD_STEPS } from "@/lib/wizard/state";

/**
 * The create wizard while its brands, products and templates load: the same fixed frame, the
 * progress column with its six steps (none current yet), the step's header as lines, two empty
 * dropdowns, the footer with Next, and the dossier's header over a block.
 */
export function CreateWizardSkeleton() {
  return (
    <div className="flex flex-col border-(length:--wizard-line) border-stroke bg-surface-primary lg:min-h-120 lg:flex-1 lg:flex-row">
      <SkeletonStatus label="Loading the wizard" />
      <div
        aria-hidden
        className="hidden w-50 shrink-0 flex-col border-r-(length:--wizard-line) border-stroke lg:flex"
      >
        <div className="flex h-13 shrink-0 flex-col justify-center gap-0.5 border-b-(length:--wizard-line) border-stroke bg-dashboard px-4">
          <span className="text-type-body-small font-medium text-heading-01">
            Progress
          </span>
          <SkeletonText className="text-type-caption-2" width={72} />
        </div>
        <ol className="flex flex-col gap-1 px-3 pt-6 pb-3">
          {WIZARD_STEPS.map((step) => (
            <li
              key={step.id}
              className="flex h-7 items-center gap-1.5 px-1.5 text-type-body-small font-medium text-heading-05"
            >
              <span className="size-2.5 shrink-0 rounded-full bg-meta-dot" />
              {step.label}
            </li>
          ))}
        </ol>
      </div>
      <div aria-hidden className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="flex h-13 shrink-0 items-center border-b-(length:--wizard-line) border-stroke bg-dashboard px-4">
          <div className="mx-auto flex w-full max-w-175 flex-col gap-1">
            <SkeletonText className="text-type-body-small" width={104} />
            <SkeletonText className="text-type-caption-2" width={300} />
          </div>
        </div>
        <div className="px-6 pt-6 pb-10 lg:min-h-0 lg:flex-1">
          <div className="mx-auto grid w-full max-w-175 gap-4 sm:grid-cols-2">
            {[40, 52].map((label) => (
              <div key={label} className="flex flex-col gap-1.5">
                <SkeletonText className="text-type-body-small" width={label} />
                <div className="flex h-10.5 items-center rounded-lg border border-stroke bg-surface-primary px-3.5 shadow-light">
                  <SkeletonText className="text-type-caption-1" width="45%" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-13 shrink-0 items-center border-t-(length:--wizard-line) border-stroke bg-dashboard px-4">
          <span className="ml-auto">
            <SkeletonButton width={67} height={26} radius="var(--radius-md)" />
          </span>
        </div>
      </div>
      <div
        aria-hidden
        className="flex shrink-0 flex-col border-t-(length:--wizard-line) border-stroke bg-surface-modal lg:min-h-0 lg:w-wizard-dossier lg:border-t-0 lg:border-l-(length:--wizard-line)"
      >
        <div className="flex h-13 shrink-0 items-center border-b-(length:--wizard-line) border-stroke bg-dashboard px-4">
          <span className="text-type-body-small font-medium text-heading-02">
            Brand &amp; product
          </span>
        </div>
        <div className="flex flex-col gap-2.5 bg-dashboard px-4 pt-6 pb-3 lg:min-h-0 lg:flex-1">
          <Skeleton height={99} radius="0" />
        </div>
      </div>
    </div>
  );
}
