"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useRef, useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { AlertIcon, CheckIcon, RefreshIcon } from "@/components/ui/icons";
import { SparkleFigmaIcon } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  type PhoneCheck,
  type QaState,
  qaStartedSchema,
  qaStateSchema,
} from "@/lib/validators/qa";

import { useDesk } from "./desk-context";
import { PanelSection } from "./panel-section";

type View = "desktop" | "phone" | "share";
const VIEWS: [View, string][] = [
  ["desktop", "Desktop"],
  ["phone", "Phone"],
  ["share", "Share"],
];

/**
 * Preview check (BUILD_SPEC §11.1, B3.3a, D111; no Figma frame yet), on the review desk's
 * Overview: the page full length at desktop (1280 px) and phone (390 px) widths, and its share
 * image as a link preview (the picture, title and description apps show when the link is
 * shared). Taken when a build finishes and from Refresh (a job; free). It says which version of
 * the page it shows, and when the page has changed since.
 */
export function PreviewCheck() {
  const { buildId, desk, reload, undo } = useDesk();
  const queryClient = useQueryClient();
  const key = ["qa", buildId];
  const [view, setView] = useState<View>("desktop");
  const [starting, setStarting] = useState(false);
  const check = useQuery({
    queryKey: key,
    queryFn: () => apiFetch(`/api/builds/${buildId}/qa`, qaStateSchema),
    // Follows a check or a phone fix under way; otherwise once.
    refetchInterval: (query) =>
      query.state.data?.running || query.state.data?.fixing ? 2000 : false,
  });
  const data = check.data;
  const running = Boolean(data?.running) || starting;
  const [fixStarting, setFixStarting] = useState(false);
  const fixing = Boolean(data?.fixing) || fixStarting;

  // A phone fix that finished: the desk catches up with the page it made (B3.3b).
  const lastFix = useRef<string | null>(null);
  useEffect(() => {
    const now = data?.fixing ?? null;
    if (lastFix.current && !now) {
      void reload();
      toast.success("Fixed the page for phones", {
        action: { label: "Undo", onClick: () => undo() },
      });
    }
    lastFix.current = now;
  }, [data?.fixing, reload, undo]);

  const fixForPhone = async () => {
    setFixStarting(true);
    try {
      await apiFetch(`/api/builds/${buildId}/phone-fix`, qaStartedSchema, {
        method: "POST",
      });
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t start Fix for phone.",
      );
    } finally {
      setFixStarting(false);
    }
  };

  const refresh = async () => {
    setStarting(true);
    try {
      await apiFetch(`/api/builds/${buildId}/qa`, qaStartedSchema, {
        method: "POST",
      });
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t start the preview check.",
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <PanelSection title="Preview check" divided>
      {!data ? (
        <div
          aria-hidden
          className="h-80 animate-pulse rounded-md bg-foreground-02"
        />
      ) : !data.desktop && !running ? (
        <div className="flex flex-col items-start gap-2 rounded-md bg-foreground-01 p-3">
          <p className="text-type-caption-1 text-sub-text">
            See the page at desktop and phone widths, and the picture shown when
            its link is shared.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Run the check
          </Button>
        </div>
      ) : !data.desktop ? (
        <div className="flex h-80 flex-col items-center justify-center gap-2 rounded-md bg-foreground-01 text-type-caption-1 text-sub-text">
          <Spinner className="size-4" label="Checking" />
          Taking the screenshots…
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label="Preview check view"
            className="flex items-center self-start rounded-md bg-foreground-03 p-0.5 ring-hair ring-stroke ring-inset dark:bg-foreground-01 dark:ring-0"
          >
            {VIEWS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                aria-label={
                  id === "phone" && data.phone_check && !data.phone_check.passed
                    ? `Phone, ${data.phone_check.issues.length} to fix`
                    : undefined
                }
                onClick={() => setView(id)}
                className="h-6 rounded-sm px-2 text-type-caption-1 font-medium text-heading-02 outline-none hover:text-body focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-surface-primary aria-pressed:text-body aria-pressed:shadow-sm dark:text-sub-text dark:aria-pressed:bg-letter-paper"
              >
                {label}
                {id === "phone" &&
                data.phone_check &&
                !data.phone_check.passed ? (
                  <span
                    aria-hidden
                    className="ml-1 inline-block size-1.5 rounded-full bg-text-danger align-middle"
                  />
                ) : null}
              </button>
            ))}
          </div>
          <Shown view={view} data={data} />
          {view === "phone" && data.phone_check ? (
            <PhoneCheckList
              check={data.phone_check}
              fixing={fixing}
              onFix={() => void fixForPhone()}
            />
          ) : null}
          <Footer
            data={data}
            pageVersion={desk.build.page_version}
            running={running}
            onRefresh={() => void refresh()}
          />
        </>
      )}
    </PanelSection>
  );
}

function Shown({ view, data }: { view: View; data: QaState }) {
  if (view === "share") {
    return (
      <figure className="overflow-hidden rounded-md bg-surface-primary ring-thin ring-stroke">
        {data.share ? (
          // eslint-disable-next-line @next/next/no-img-element -- the page's share image
          <img
            src={data.share}
            alt="The page's share image"
            className="aspect-40/21 w-full object-cover"
          />
        ) : (
          <div className="aspect-40/21 w-full bg-foreground-02" />
        )}
        <figcaption className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="line-clamp-2 text-type-caption-1 font-medium text-heading-01">
            {data.title ?? "Untitled page"}
          </span>
          {data.description ? (
            <span className="line-clamp-2 text-type-caption-2 text-sub-text">
              {data.description}
            </span>
          ) : null}
          <span className="text-type-caption-2 text-heading-06">
            How the page’s link looks when it’s shared
          </span>
        </figcaption>
      </figure>
    );
  }
  const shot = view === "desktop" ? data.desktop : data.phone;
  if (!shot) return null;
  return (
    <div
      className={cn(
        "h-80 overflow-y-auto rounded-md bg-foreground-02 ring-thin ring-stroke ring-inset",
        view === "phone" && "mx-auto w-44",
      )}
    >
      <a
        href={shot.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open the ${view} screenshot full size`}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link */}
        <img
          src={shot.url}
          alt={`The page at ${shot.width} px wide`}
          className="w-full"
        />
      </a>
    </div>
  );
}

/**
 * The phone check (B3.3b, D112) under the phone screenshot: passed, or what it found (wider
 * than the screen, small text, small buttons, overlapping text, with where), and Fix for phone:
 * Claude writes phone-only CSS, about 5 to 10 cents, one undo step.
 */
function PhoneCheckList({
  check,
  fixing,
  onFix,
}: {
  check: PhoneCheck;
  fixing: boolean;
  onFix: () => void;
}) {
  if (check.passed)
    return (
      <p className="flex items-start gap-1.5 rounded-md bg-foreground-01 px-2.5 py-2 text-type-caption-1 text-sub-text">
        <CheckIcon
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-heading-06"
        />
        Phone check passed: nothing runs off the screen, the text is readable
        and the buttons are big enough to tap.
      </p>
    );
  return (
    <div className="flex flex-col gap-2 rounded-md bg-foreground-01 p-2.5">
      <p className="flex items-center gap-1.5 text-type-caption-1 font-medium text-heading-02">
        <AlertIcon aria-hidden className="size-3.5 text-text-danger" />
        Phone check: {check.issues.length}{" "}
        {check.issues.length === 1 ? "thing" : "things"} to fix
      </p>
      <ul className="flex flex-col gap-2">
        {check.issues.map((issue) => (
          <li key={issue.kind} className="flex flex-col gap-0.5">
            <span className="text-type-caption-1 text-heading-02">
              {issue.title}
              <span className="text-heading-06 tabular-nums">
                {" "}
                · {issue.count}
              </span>
            </span>
            <span className="text-type-caption-2 text-sub-text">
              {issue.detail}
            </span>
            {issue.examples.map((example) => (
              <span
                key={`${example.text}-${example.section}`}
                className="truncate text-type-caption-2 text-heading-06"
              >
                {example.text ? `“${example.text}”` : "An element"}
                {example.section ? ` in ${example.section}` : ""}
              </span>
            ))}
          </li>
        ))}
      </ul>
      {fixing ? (
        <p
          role="status"
          className="flex h-7 items-center gap-2 text-type-caption-1 text-sub-text"
        >
          <Spinner className="size-3.5" label="Fixing" />
          Fixing for phone…
        </p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={onFix}
        >
          <SparkleFigmaIcon aria-hidden className="size-3.5" />
          Fix for phone
          <span className="font-normal text-sub-text">· about 10¢</span>
        </Button>
      )}
    </div>
  );
}

function Footer({
  data,
  pageVersion,
  running,
  onRefresh,
}: {
  data: QaState;
  /** The page's version now (the desk's): the screenshots say when they show an older one. */
  pageVersion: number;
  running: boolean;
  onRefresh: () => void;
}) {
  const stale = data.version !== null && data.version !== pageVersion;
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="flex flex-col text-type-caption-2 text-heading-06">
        <span className="tabular-nums">
          Version {data.version}
          {data.taken_at
            ? ` · ${formatDistanceToNowStrict(new Date(data.taken_at), { addSuffix: true })}`
            : ""}
        </span>
        {stale ? (
          <span className="text-heading-02">
            The page has changed since (version {pageVersion}).
          </span>
        ) : null}
      </p>
      <Button
        variant="ghost"
        size="sm"
        disabled={running}
        onClick={onRefresh}
        className="-mr-1.5 h-7 shrink-0 px-1.5 text-type-caption-1 text-heading-02 hover:bg-foreground-02"
      >
        {running ? (
          <Spinner className="size-3.5" />
        ) : (
          <RefreshIcon aria-hidden className="size-3.5" />
        )}
        {running ? "Checking…" : "Refresh"}
      </Button>
    </div>
  );
}
