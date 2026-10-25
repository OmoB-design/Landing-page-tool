"use client";

import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { useId, useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyIcon, ExternalLinkIcon } from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useHydrated } from "@/lib/use-hydrated";
import type { Publication } from "@/lib/validators/publishing";

import { useDesk } from "./desk-context";
import { PanelSection } from "./panel-section";
import { usePublish } from "./publish-context";

const OVERRIDE_LABELS: Record<string, string> = {
  copy_error: "copy still in the template’s words",
  claims: "claims marked Fix",
  placeholder_images: "placeholder images",
  residue: "the source brand still visible",
};

function ago(date: string) {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}

function hostAndPath(url: string) {
  return url.replace(/^https?:\/\//, "");
}

/**
 * Publish (D87; the build page header, after Approve): asks first in a card naming the
 * destination, then lists what blocks it. Reasons that may be passed need "Publish anyway";
 * placeholder images pass only with the owner's testing switch. While it runs, the button shows
 * the step it's on; when it finishes, the published modal opens. To be designed in Figma.
 */
export function PublishButton() {
  const { desk, pending, redrafting } = useDesk();
  const { publishing, publish, starting, job } = usePublish();
  const [open, setOpen] = useState(false);
  const [anyway, setAnyway] = useState(false);
  const anywayId = useId();
  const status = desk.build.status;
  if (status !== "approved" && status !== "published") return null;
  const running = publishing.running !== null;
  const stuck = publishing.gate.filter((b) => !b.overridable);
  const passable = publishing.gate.filter((b) => b.overridable);
  const step = job?.events.at(-1)?.message;
  const ready =
    publishing.vercel_connected &&
    stuck.length === 0 &&
    (passable.length === 0 || anyway);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAnyway(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="compact"
          disabled={
            running || starting || pending !== null || redrafting !== null
          }
          title={running && step ? step : undefined}
          className="px-3"
        >
          {running || starting ? (
            <Spinner className="size-3.5" label="Publishing" />
          ) : null}
          {running
            ? "Publishing…"
            : status === "published"
              ? "Publish again"
              : "Publish"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-menu-header flex-col gap-2.5 rounded-md bg-surface-primary p-3 text-type-caption-1 font-medium shadow-float edge-hairline"
      >
        <p className="text-heading-01">Publish to Vercel</p>
        {!publishing.vercel_connected ? (
          <p className="text-heading-05">
            Connect your Vercel account first, in{" "}
            <Link
              href="/settings/connections"
              className="text-text-link hover:underline"
            >
              Settings → Connections
            </Link>
            .
          </p>
        ) : (
          <p className="text-heading-05">
            The page goes live at its own address on the brand’s Vercel project.
          </p>
        )}
        {publishing.gate.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {publishing.gate.map((blocker) => (
              <li
                key={blocker.code}
                className="rounded-md bg-foreground-01 p-1.5 text-heading-02"
              >
                {blocker.message}
                {!blocker.overridable &&
                blocker.code === "placeholder_images" ? (
                  <span className="block text-heading-05">
                    Real images arrive with fal credits; the owner can allow
                    publishing them for testing in Settings → General.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {stuck.length === 0 && passable.length > 0 ? (
          <label
            htmlFor={anywayId}
            className="flex items-start gap-2 text-heading-02"
          >
            <input
              id={anywayId}
              type="checkbox"
              checked={anyway}
              onChange={(event) => setAnyway(event.target.checked)}
              className="mt-0.5 size-3.5 accent-spot-500-blue"
            />
            Publish anyway. I’ve checked these; this is recorded with my name.
          </label>
        ) : null}
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="compact"
            disabled={!ready}
            onClick={async () => {
              if (await publish(passable.length > 0)) setOpen(false);
            }}
          >
            Publish
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Live ↗ (the header, once a page is published): opens the published modal. */
export function LiveButton() {
  const { publishing, setModalOpen } = usePublish();
  if (!publishing.live) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="compact"
      onClick={() => setModalOpen(true)}
      className="px-2 text-heading-02"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-spot-500-green" />
      Live
    </Button>
  );
}

/**
 * The published modal (D87; the owner's layout): the live page on the left, its details on the
 * right, and below them where it's published (Vercel, live) beside Publish to Shopify (B1.5b).
 * Opens by itself when a publish finishes, and from Live in the header. The preview is the live
 * address itself (Vercel's static pages may be framed), shown at 40 % and opening on click.
 */
export function PublishedModal() {
  const { publishing, page, modalOpen, setModalOpen } = usePublish();
  const { meId } = useDesk();
  const hydrated = useHydrated();
  const live = publishing.live;
  if (!live?.url) return null;
  const url = live.url;
  const stale =
    live.page_version !== null && live.page_version !== publishing.page_version;
  const copy = () =>
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn’t copy the link."));
  const rows: [string, string][] = [
    ["Page", `${page.key} · ${page.title}`],
    ...(page.brand ? ([["Brand", page.brand]] as [string, string][]) : []),
    ...(page.product
      ? ([["Product", page.product]] as [string, string][])
      : []),
    ...(page.template
      ? ([["Template", page.template]] as [string, string][])
      : []),
    [
      "Published",
      `${hydrated ? `${ago(live.created_at)} ` : ""}by ${live.created_by === meId ? "you" : "a teammate"}`,
    ],
    ...(live.project
      ? ([["Vercel project", live.project]] as [string, string][])
      : []),
  ];
  return (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="grid md:grid-cols-5">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${hostAndPath(url)}`}
            className="group flex flex-col gap-2 bg-foreground-01 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:col-span-3 dark:bg-foreground-02"
          >
            <div className="overflow-hidden rounded-md bg-surface-primary shadow-panel edge-hairline">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 divider-b-half">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-foreground-03"
                />
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-foreground-03"
                />
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-foreground-03"
                />
                <span className="ml-1.5 min-w-0 truncate text-type-caption-2 font-medium text-heading-05">
                  {hostAndPath(url)}
                </span>
              </div>
              <div className="relative h-72 overflow-hidden">
                <iframe
                  src={url}
                  title="The live page"
                  sandbox=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  tabIndex={-1}
                  className="pointer-events-none absolute top-0 left-0 h-180 w-320 origin-top-left scale-40 border-0"
                />
              </div>
            </div>
            <span className="flex items-center gap-1 text-type-caption-1 font-medium text-heading-05 group-hover:text-heading-02">
              <ExternalLinkIcon className="size-3.5" /> Open the live page
            </span>
          </a>
          <div className="flex flex-col gap-3 p-4 md:col-span-2">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-type-body-small text-heading-01">
                Your page is live
              </DialogTitle>
              <DialogDescription className="text-type-caption-1 font-medium text-heading-05">
                {stale
                  ? "This is the version you published; publish again to put your latest changes live."
                  : "Anyone with the link can open it."}
              </DialogDescription>
            </div>
            <dl className="flex flex-col gap-1">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-3 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium dark:bg-foreground-02"
                >
                  <dt className="shrink-0 text-heading-02">{label}</dt>
                  <dd className="min-w-0 truncate text-right text-heading-05">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center gap-1.5 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium dark:bg-foreground-02">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-text-link hover:underline"
              >
                {hostAndPath(url)}
              </a>
              <Button type="button" variant="outline" size="xs" onClick={copy}>
                <CopyIcon className="size-3" /> Copy
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4 divider-t-half">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-type-caption-1 font-medium">
            <span className="flex items-center gap-1.5 rounded-sm bg-tint-green px-1.5 py-0.5 text-text-success">
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-spot-500-green"
              />
              Live on Vercel
            </span>
            {live.seconds ? (
              <span className="text-heading-05">Ready in {live.seconds} s</span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="compact"
            disabled
            title="Publishing to Shopify arrives next (B1.5b)"
          >
            Publish to Shopify
          </Button>
          <Button asChild size="compact">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="size-3.5" /> Open page
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Published (the Overview): each publish with where, when, who, and any reasons passed. */
export function Publications() {
  const { publishing } = usePublish();
  const { meId } = useDesk();
  const hydrated = useHydrated();
  if (publishing.publications.length === 0) return null;
  return (
    <PanelSection
      title="Published"
      count={publishing.publications.length}
      divided
    >
      <ol className="flex flex-col gap-1">
        {publishing.publications.map((p) => (
          <PublicationRow
            key={p.id}
            publication={p}
            mine={p.created_by === meId}
            hydrated={hydrated}
          />
        ))}
      </ol>
    </PanelSection>
  );
}

function PublicationRow({
  publication: p,
  mine,
  hydrated,
}: {
  publication: Publication;
  mine: boolean;
  hydrated: boolean;
}) {
  const label =
    p.status === "succeeded"
      ? "Live"
      : p.status === "failed"
        ? "Failed"
        : "Publishing";
  return (
    <li className="flex flex-col gap-1 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium">
      <div className="flex items-center gap-1.5">
        <span className="rounded-sm bg-foreground-02 px-1.5 text-type-caption-2 text-heading-02">
          {label}
        </span>
        {p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-text-link hover:underline"
          >
            {hostAndPath(p.url)}
          </a>
        ) : (
          <span className="min-w-0 flex-1 text-heading-05">Vercel</span>
        )}
      </div>
      <span className="text-type-caption-2 text-heading-05">
        {hydrated ? `${ago(p.created_at)} · ` : ""}
        {mine ? "You" : "A teammate"}
        {p.gate_overridden && p.override_reasons.length > 0
          ? ` · published anyway: ${p.override_reasons.map((r) => OVERRIDE_LABELS[r] ?? r).join(", ")}`
          : ""}
      </span>
      {p.error ? <span className="text-text-danger">{p.error}</span> : null}
    </li>
  );
}
