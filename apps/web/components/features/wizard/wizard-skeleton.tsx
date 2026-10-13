import {
  SkeletonButton,
  SkeletonStatus,
  SkeletonText,
} from "@/components/app/skeletons";
import { WIZARD_STEPS } from "@/lib/wizard/state";

/**
 * The create wizard while its brands, products and templates load: the same panel, the step bar
 * with its six numbered steps (none current yet), the first step's title, hint and two pickers as
 * lines, the dossier and the footer with Next.
 */
export function CreateWizardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-stroke bg-surface-primary">
      <SkeletonStatus label="Loading the wizard" />
      <div aria-hidden className="contents">
        <div className="border-b border-stroke px-6 py-4">
          <div className="@container">
            <div className="flex flex-col gap-2 @2xl:hidden">
              <SkeletonText className="text-type-caption-1" width={160} />
              <div className="h-1 rounded-full bg-foreground-01" />
            </div>
            <ol className="hidden items-center @2xl:flex">
              {WIZARD_STEPS.map((step, index) => (
                <li
                  key={step.id}
                  className="flex flex-1 items-center last:flex-none"
                >
                  <span className="flex shrink-0 items-center gap-2 px-1.5 py-1 text-type-caption-1 text-caption-1">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-stroke-strong tabular-nums">
                      {index + 1}
                    </span>
                    <span className="hidden @4xl:inline">{step.label}</span>
                  </span>
                  {index < WIZARD_STEPS.length - 1 ? (
                    <span className="mx-2 h-px min-w-4 flex-1 bg-stroke-strong" />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <SkeletonText className="text-type-h6" width={184} />
              <SkeletonText className="text-type-caption-1" width={300} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[56, 64].map((label) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <SkeletonText className="text-type-caption-1" width={label} />
                  <div className="flex h-9 items-center rounded-sm border border-stroke-strong bg-surface-primary pr-2 pl-2.5">
                    <SkeletonText
                      className="text-type-body-small"
                      width="55%"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 border-t border-stroke bg-dashboard p-5 lg:w-wizard-dossier lg:border-t-0 lg:border-l">
            <div className="flex flex-col gap-5">
              <span className="text-type-body-small font-semibold">
                Brand dossier
              </span>
              <div className="flex flex-col">
                <SkeletonText className="text-type-caption-1" width="100%" />
                <SkeletonText className="text-type-caption-1" width="72%" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center border-t border-stroke px-6 py-3">
          <span className="ml-auto">
            <SkeletonButton width={72} height={28} />
          </span>
        </div>
      </div>
    </div>
  );
}
