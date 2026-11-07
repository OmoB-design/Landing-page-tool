"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertIcon,
  CheckIcon,
  InfoIcon,
  WarningIcon,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { useJob } from "@/lib/queries/jobs";
import { reloadTemplate, startLayoutCheck } from "@/lib/templates/actions";
import type {
  LayoutCheck,
  ShopifyMap,
  TemplateEditorState,
} from "@/lib/validators/template";

import { QUIET } from "./analysis-bar";

const LEVEL = {
  error: { icon: AlertIcon, label: "Problem", tone: "text-spot-500-red" },
  warning: {
    icon: WarningIcon,
    label: "Warning",
    tone: "text-spot-500-yellow",
  },
  info: { icon: InfoIcon, label: "Note", tone: "text-caption-1" },
} as const;

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

const ROW =
  "flex items-start gap-2.5 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1";

function names(list: string[], shown = 3) {
  if (list.length <= shown) return list.join(", ");
  return `${list.slice(0, shown).join(", ")} and ${list.length - shown} more`;
}

/** What the last layout check found, in a sentence or two. */
export function layoutSummary(layout: LayoutCheck): {
  title: string;
  detail: string;
} {
  if (!layout.matched) {
    const off = Object.entries(layout.widths)
      .filter(([, ok]) => !ok)
      .map(([width]) => width);
    return {
      title: `The layout differs in Shopify${off.length ? ` at ${off.join(", ")}` : ""}`,
      detail: layout.differences.slice(0, 2).join(" "),
    };
  }
  const detail =
    layout.mode === "sections"
      ? `${count(layout.sections, "Shopify section")}, one for each section here.`
      : layout.mode === "grouped"
        ? `${count(layout.sections, "Shopify section")}; parts side by side or sticky are kept together in one: ${names(layout.kept_together)}.`
        : "The whole page is one Shopify section; its texts and pictures can still be edited.";
  return {
    title: "The layout matches at desktop, tablet and phone",
    detail,
  };
}

/**
 * Check layout (B4.3, D122): Shopify's render of a page from this template compared with the page
 * at three widths, as a job (about ten seconds, free); the editor reloads when it's done. Before a
 * check, after one, or when the page has changed since, it says so and offers to check again.
 */
function LayoutCheckRow({
  map,
  templateId,
  onState,
}: {
  map: ShopifyMap;
  templateId?: string;
  onState?: (next: TemplateEditorState) => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { data: job } = useJob(jobId);
  const settled = useRef<string | null>(null);

  useEffect(() => {
    if (
      !templateId ||
      !job ||
      job.status !== "succeeded" ||
      settled.current === job.id
    )
      return;
    settled.current = job.id;
    startTransition(async () => {
      const result = await reloadTemplate(templateId);
      if (result.state) onState?.(result.state);
      setJobId(null);
    });
  }, [job, onState, templateId]);

  const failed = job?.status === "failed" || job?.status === "cancelled";
  const running =
    pending || (jobId !== null && job?.status !== "succeeded" && !failed);
  const failure =
    startError ??
    (failed
      ? (job?.error?.message ?? "The layout check didn’t finish.")
      : null);
  const check = () =>
    startTransition(async () => {
      setStartError(null);
      if (!templateId) return;
      const result = await startLayoutCheck(templateId);
      if (result.jobId) setJobId(result.jobId);
      else setStartError(result.error ?? "Couldn’t start the layout check.");
    });

  const { layout } = map;
  let icon: React.ReactNode;
  let title: string;
  let detail: string | null = null;
  if (running) {
    icon = <Spinner className="mt-px size-3.5 text-icon-system" />;
    const latest = job?.events.at(-1)?.message;
    title = "Checking the layout…";
    detail = latest ?? "About ten seconds.";
  } else if (failure) {
    icon = (
      <AlertIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-spot-500-red"
      />
    );
    title = "The layout check didn’t finish";
    detail = failure;
  } else if (!layout) {
    icon = (
      <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-caption-1" />
    );
    title = "Layout not checked yet";
    detail =
      "Check that pages from this template look the same in Shopify at desktop, tablet and phone. About ten seconds, free.";
  } else {
    const summary = layoutSummary(layout);
    icon = layout.matched ? (
      <CheckIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-spot-500-green"
      />
    ) : (
      <WarningIcon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-spot-500-yellow"
      />
    );
    title = summary.title;
    detail = map.layout_stale
      ? `${summary.detail} The page has changed since this check (version ${layout.version}).`
      : summary.detail;
  }
  const again = Boolean(layout) && !map.layout_stale && !failure;
  return (
    <div className={ROW} aria-live="polite">
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {detail ? (
          <span className="break-words text-sub-text">{detail}</span>
        ) : null}
      </span>
      {templateId ? (
        <Button
          variant={again ? "outline" : "default"}
          size="compact"
          className={again ? `shrink-0 ${QUIET}` : "shrink-0"}
          disabled={running}
          onClick={check}
        >
          {failure ? "Try again" : layout ? "Check again" : "Check layout"}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Shopify editing (B4.1, D120; no Figma frame yet, styled as the Details tab's other sections and
 * the Issues tab's rows): what a page from this template would let people change in Shopify's theme
 * editor once M4 publishes editable sections. One line with the totals (and what can't be edited
 * there, which still shows), the layout check (B4.3), notes and problems, then each section with
 * its editable texts, pictures and videos; sections gathered from parts outside the marked ones
 * say "Added".
 */
export function ShopifyCard({
  map,
  templateId,
  onState,
}: {
  map: ShopifyMap;
  /** The template, for Check layout (B4.3); without it the card only shows the last check. */
  templateId?: string;
  onState?: (next: TemplateEditorState) => void;
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="shopify-editing">
      <h2
        id="shopify-editing"
        className="flex items-center gap-2 text-type-body-small font-medium"
      >
        {map.ready ? (
          <CheckIcon aria-hidden className="size-4 text-spot-500-green" />
        ) : (
          <AlertIcon aria-hidden className="size-4 text-spot-500-red" />
        )}
        Shopify editing
      </h2>
      <p className="text-type-caption-1 text-sub-text">
        {map.ready
          ? "When a page from this template goes to Shopify as editable sections, these parts can be changed in Shopify’s theme editor."
          : "Pages from this template can’t go to Shopify as editable sections yet."}
      </p>
      <p className="text-type-caption-1 font-medium">
        {count(map.sections.length, "section")} · {count(map.texts, "text")} ·{" "}
        {count(map.images, "picture")}
        {map.media > 0 ? ` · ${count(map.media, "video")}` : ""} editable
      </p>
      {map.static > 0 ? (
        <p className="text-type-caption-1 text-sub-text">
          {map.static} can’t be edited in Shopify. They still show on the page;
          change them in LP and publish again.
        </p>
      ) : null}
      {map.ready ? (
        <LayoutCheckRow map={map} templateId={templateId} onState={onState} />
      ) : null}
      {map.issues.length > 0 ? (
        <ul role="list" className="flex flex-col gap-1.5">
          {map.issues.map((issue, i) => {
            const { icon: LevelIcon, label, tone } = LEVEL[issue.level];
            return (
              <li key={`${issue.level}-${i}`} className={ROW}>
                <LevelIcon
                  aria-hidden
                  className={`mt-0.5 size-4 shrink-0 ${tone}`}
                />
                <span className="sr-only">{label}: </span>
                <span className="min-w-0 flex-1 break-words">
                  {issue.message}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {map.sections.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {map.sections.map((section) => (
            <li
              key={section.key}
              className="flex items-baseline justify-between gap-4 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1"
            >
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-medium">{section.name}</span>
                {section.loose ? (
                  <span className="shrink-0 text-sub-text">Added</span>
                ) : null}
              </span>
              <span className="shrink-0 text-sub-text tabular-nums">
                {[
                  section.texts > 0 ? count(section.texts, "text") : null,
                  section.images > 0 ? count(section.images, "picture") : null,
                  section.media > 0 ? count(section.media, "video") : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Nothing to edit"}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
