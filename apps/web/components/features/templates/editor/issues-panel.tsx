import { Button } from "@/components/ui/button";
import {
  AlertIcon,
  CheckIcon,
  InfoIcon,
  WarningIcon,
} from "@/components/ui/icons";
import type { TemplateIssue } from "@/lib/validators/template";

const SEVERITY = {
  error: { icon: AlertIcon, label: "Problem", tone: "text-spot-500-red" },
  warning: {
    icon: WarningIcon,
    label: "Warning",
    tone: "text-spot-500-yellow",
  },
  info: { icon: InfoIcon, label: "Note", tone: "text-caption-1" },
} as const;

/** The Issues tab: template checks (blocks outside sections, missing slots, outside links). */
export function IssuesPanel({
  issues,
  onShow,
}: {
  issues: TemplateIssue[];
  onShow: (section: string) => void;
}) {
  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-2 p-4 text-type-caption-1 text-sub-text">
        <CheckIcon aria-hidden className="size-4 text-spot-500-green" />
        No issues found in this template.
      </p>
    );
  }
  return (
    <ul role="list" className="flex flex-col gap-1.5 p-4">
      {issues.map((issue, i) => {
        const { icon: SeverityIcon, label, tone } = SEVERITY[issue.severity];
        return (
          <li
            key={`${issue.severity}-${i}`}
            className="flex items-start gap-2.5 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1"
          >
            <SeverityIcon
              aria-hidden
              className={`mt-0.5 size-4 shrink-0 ${tone}`}
            />
            <span className="sr-only">{label}: </span>
            <span className="min-w-0 flex-1 break-words">{issue.message}</span>
            {issue.section ? (
              <Button
                variant="ghost"
                size="sm"
                className="-my-1 h-7 shrink-0"
                onClick={() => onShow(issue.section ?? "")}
              >
                Show
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
