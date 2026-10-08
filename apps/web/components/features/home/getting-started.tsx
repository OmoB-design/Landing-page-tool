import { ProgressTracker } from "@/components/ui/progress-tracker";
import type { SetupProgress } from "@/lib/onboarding/progress";

/** Home checklist: the five setup steps, ticked from real data; each links to where it's done. */
export function GettingStarted({ progress }: { progress: SetupProgress }) {
  return (
    <ProgressTracker
      title="Getting started"
      readOnly
      steps={progress.steps.map(({ id, label, done, href }) => ({
        id,
        label,
        done,
        href,
      }))}
    />
  );
}
