"use client";

import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { type ReactNode, useId, useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CloseFigmaIcon,
  LaptopFigmaIcon,
  PhoneFigmaIcon,
  ShopifyLogo,
  VercelLogo,
  VerifiedFigmaIcon,
} from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import { useHydrated } from "@/lib/use-hydrated";
import type { Publication } from "@/lib/validators/publishing";

import {
  ShopifyConnectDialog,
  ShopifyFullWidthDialog,
} from "../settings/shopify";

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

/** The live dot (D89): solid green, with a ring that pulses out of it while the page is live. */
export function LiveDot() {
  return (
    <span aria-hidden className="relative flex size-1.5 shrink-0">
      <span className="absolute inset-0 rounded-full bg-spot-500-green motion-safe:animate-live-pulse" />
      <span className="relative size-1.5 rounded-full bg-spot-500-green" />
    </span>
  );
}

/** Live (the header, once a page is published, in place of the status chip): opens the published
 * modal. */
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
      <LiveDot />
      Live
    </Button>
  );
}

/** A destination row's action (Figma 631:14872): 12 px label, light shadow. */
const ROW_ACTION = "text-type-caption-1 shadow-light";

/** A destination row (Figma 631:14865): the logo on its tile, the name, its state, an action. */
function DestinationRow({
  logo,
  name,
  status,
  action,
  children,
}: {
  logo: ReactNode;
  name: string;
  status: ReactNode;
  action: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2.5 p-3 not-first:divider-t-strong">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-foreground-01 dark:bg-foreground-02">
          {logo}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-type-caption-1">
          <span className="font-medium text-heading-01">{name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-heading-05">
            {status}
          </span>
        </div>
        {action}
      </div>
      {children}
    </li>
  );
}

/** The inline "are you sure" under a destination row. */
function RowConfirm({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-foreground-01 p-2.5 text-type-caption-1 font-medium dark:bg-foreground-02">
      {children}
    </div>
  );
}

/**
 * The published modal's Shopify row (D90), by state: not connected (Connect Shopify opens the
 * connect modal for this page's brand), connected (Publish to Shopify; reasons the page is held
 * back are asked about first), publishing, and a draft (Open in admin, Update draft).
 */
function ShopifyRow() {
  const { publishing, page, publish, starting, refresh } = usePublish();
  const [connectOpen, setConnectOpen] = useState(false);
  const [fullWidthOpen, setFullWidthOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const running = publishing.running?.destination === "shopify_page";
  const draft = publishing.shopify_draft;
  const stuck = publishing.gate.filter((b) => !b.overridable);
  const passable = publishing.gate.filter((b) => b.overridable);
  const send = async (override: boolean) => {
    if (await publish(override, "shopify_page")) setAsking(false);
  };
  const start = () =>
    publishing.gate.length > 0 ? setAsking(true) : void send(false);
  let status: ReactNode = "Not connected";
  if (running)
    status = (
      <>
        <Spinner className="size-3" label="Publishing to Shopify" />
        Publishing to Shopify…
      </>
    );
  else if (draft)
    status = (
      <span className="truncate">
        Draft · {draft.url?.split("/pages/")[1] ?? "saved"}
      </span>
    );
  else if (publishing.shopify_domain)
    status = (
      <span className="truncate">
        Not published yet · {publishing.shopify_domain}
      </span>
    );
  let action: ReactNode = null;
  if (!publishing.shopify_domain)
    action = (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={ROW_ACTION}
        disabled={!page.brandId}
        onClick={() => setConnectOpen(true)}
      >
        Connect Shopify
      </Button>
    );
  else if (!asking)
    action = (
      <div className="flex gap-1.5">
        {draft?.admin_url ? (
          <Button asChild variant="outline" size="sm" className={ROW_ACTION}>
            <a href={draft.admin_url} target="_blank" rel="noreferrer">
              Open in admin
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ROW_ACTION}
          disabled={running || starting}
          onClick={start}
        >
          {draft ? "Update draft" : "Publish to Shopify"}
        </Button>
      </div>
    );
  return (
    <DestinationRow
      logo={<ShopifyLogo className="h-4" />}
      name="Shopify"
      status={status}
      action={action}
    >
      {draft?.full_width === false && !asking ? (
        <p className="pl-11 text-type-caption-1 text-heading-05">
          Fitted into the theme’s page, its header and footer hidden.{" "}
          <button
            type="button"
            onClick={() => setFullWidthOpen(true)}
            className="font-medium text-text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Set up full width for an exact fit
          </button>
        </p>
      ) : null}
      <ShopifyFullWidthDialog
        open={fullWidthOpen}
        onOpenChange={setFullWidthOpen}
        shop={publishing.shopify_domain}
      />
      {asking ? (
        <RowConfirm>
          {publishing.gate.map((blocker) => (
            <p key={blocker.code} className="text-heading-02">
              {blocker.message}
            </p>
          ))}
          <p className="text-heading-05">
            {stuck.length > 0
              ? "This holds the page back from Shopify too."
              : "Send it to Shopify as a draft anyway? This is recorded with your name."}
          </p>
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => setAsking(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="compact"
              disabled={stuck.length > 0 || starting}
              onClick={() => void send(passable.length > 0)}
            >
              Send anyway
            </Button>
          </div>
        </RowConfirm>
      ) : null}
      {page.brandId ? (
        <ShopifyConnectDialog
          open={connectOpen}
          onOpenChange={setConnectOpen}
          brands={[{ id: page.brandId, name: page.brand ?? "this brand" }]}
          brandId={page.brandId}
          onConnected={refresh}
        />
      ) : null}
    </DestinationRow>
  );
}

const VIEWPORTS = [
  ["desktop", "Desktop", LaptopFigmaIcon],
  ["phone", "Phone", PhoneFigmaIcon],
] as const;

/**
 * The published modal (D87; redesigned D89; the owner's Figma frame 635:15084, light, with its
 * dark values crafted to match). A white rim around the panel; a header band (verified badge,
 * when, by whom, how fast; close); the live page in a browser frame with a Desktop / Phone switch
 * (it scrolls; scripts stay off); a washed band with the address and Copy, then where the page is
 * published, one row per destination (Vercel: Live and Unpublish, which asks first; Shopify,
 * D90); the page's details on one line; a footer band with Done and Open page. Opens by itself
 * when a publish finishes, and from Live in the header.
 */
export function PublishedModal() {
  const { publishing, page, modalOpen, setModalOpen, unpublish, starting } =
    usePublish();
  const { meId } = useDesk();
  const hydrated = useHydrated();
  const [viewport, setViewport] = useState<"desktop" | "phone">("desktop");
  const [confirming, setConfirming] = useState(false);
  const live = publishing.live;
  if (!live?.url) return null;
  const url = live.url;
  const unpublishing =
    publishing.running?.action === "unpublish" || (starting && confirming);
  const stale =
    live.page_version !== null && live.page_version !== publishing.page_version;
  const copy = () =>
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn’t copy the link."));
  const who = live.created_by === meId ? "you" : "a teammate";
  const details = [
    page.key,
    page.title,
    page.brand,
    page.product,
    page.template,
  ]
    .filter(Boolean)
    .join(" · ");
  const frame = (key: string, className: string) => (
    <iframe
      key={key}
      src={url}
      title="The live page"
      sandbox=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
    />
  );
  return (
    <Dialog
      open={modalOpen}
      onOpenChange={(open) => {
        setModalOpen(open);
        if (!open) setConfirming(false);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-well bg-surface-primary p-1 ring-0 sm:max-w-151.5 dark:bg-surface-modal dark:ring-1 dark:ring-stroke"
      >
        <div className="flex flex-col gap-4 overflow-hidden rounded-lg bg-surface-modal shadow-float ring-half ring-stroke">
          <div className="flex flex-col">
            <div className="flex items-start gap-3 bg-foreground-01 px-5 py-2.5 dark:bg-surface-primary">
              <div className="flex min-w-0 flex-1 items-start gap-1.5">
                <VerifiedFigmaIcon className="size-4 shrink-0 text-heading-01" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <DialogTitle className="font-tight text-type-dialog-title font-medium text-heading-01">
                    Your page is live
                  </DialogTitle>
                  <DialogDescription className="truncate text-type-caption-1 font-medium text-heading-05">
                    {stale
                      ? "This is the version you published; publish again to put your latest changes live."
                      : `Published ${hydrated ? `${ago(live.created_at)} ` : ""}by ${who}${live.seconds ? ` · ready in ${live.seconds} s` : ""}`}
                  </DialogDescription>
                </div>
              </div>
              <DialogClose
                aria-label="Close"
                className="rounded-xsm text-icon-system transition-colors duration-150 ease-out outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CloseFigmaIcon className="size-4" />
              </DialogClose>
            </div>

            <div className="px-5 pt-4">
              <div className="overflow-hidden rounded-lg bg-foreground-01 ring-half ring-stroke dark:bg-surface-primary">
                <div className="flex items-center gap-2 px-3 py-1 divider-b-half">
                  <span aria-hidden className="flex w-6.5 gap-1">
                    <span className="size-1.5 rounded-full bg-highlight-red-500" />
                    <span className="size-1.5 rounded-full bg-icon-explainer" />
                    <span className="size-1.5 rounded-full bg-highlight-green-500" />
                  </span>
                  <div className="flex min-w-0 flex-1 justify-center">
                    <span className="truncate rounded-md bg-foreground-02 px-4 py-1 text-type-caption-2 font-medium text-heading-05">
                      {hostAndPath(url)}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Preview width"
                    className="flex rounded-xsm bg-surface-primary p-0.5 shadow-light ring-half ring-stroke dark:bg-foreground-01"
                  >
                    {VIEWPORTS.map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={viewport === id}
                        aria-label={label}
                        title={label}
                        onClick={() => setViewport(id)}
                        className="flex items-center justify-center rounded-xxs px-1 py-0.5 text-heading-01 transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-foreground-02 dark:aria-pressed:bg-foreground-03"
                      >
                        <Icon className="size-3" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative h-80 overflow-hidden bg-surface-primary">
                  {viewport === "desktop" ? (
                    frame(
                      "desktop",
                      "absolute top-0 left-0 h-182 w-317.25 origin-top-left scale-44 border-0",
                    )
                  ) : (
                    <div className="mx-auto h-full w-73 overflow-hidden edge-hairline">
                      {frame(
                        "phone",
                        "h-106.5 w-97.5 origin-top-left scale-75 border-0",
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="bg-dashboard divider-y-half dark:bg-surface-primary/50">
              <div className="flex items-center gap-2 px-5 pt-3 pb-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center rounded-sm bg-foreground-02 px-2.5 py-2 font-address text-type-caption-1 leading-4 text-text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate">{hostAndPath(url)}</span>
                </a>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={ROW_ACTION}
                  onClick={copy}
                >
                  Copy
                </Button>
              </div>

              <section className="flex flex-col gap-2 px-5 pt-5 pb-3">
                <h3 className="text-type-caption-1 font-medium text-heading-05">
                  Where it’s published
                </h3>
                <ul className="flex flex-col overflow-hidden rounded-lg edge-hairline">
                  <DestinationRow
                    logo={<VercelLogo className="w-3.5 text-heading-01" />}
                    name="Vercel"
                    status={
                      unpublishing ? (
                        <>
                          <Spinner className="size-3" label="Unpublishing" />
                          Unpublishing…
                        </>
                      ) : (
                        <span className="truncate">
                          Live{live.project ? ` · ${live.project}` : ""}
                        </span>
                      )
                    }
                    action={
                      confirming ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={ROW_ACTION}
                          disabled={unpublishing}
                          onClick={() => setConfirming(true)}
                        >
                          Unpublish
                        </Button>
                      )
                    }
                  >
                    {confirming ? (
                      <RowConfirm>
                        <p className="text-heading-02">
                          Take {page.key} down from {hostAndPath(url)}?
                        </p>
                        <p className="text-heading-05">
                          The brand’s other pages stay up. You can publish it
                          again any time.
                        </p>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            disabled={unpublishing}
                            onClick={() => setConfirming(false)}
                          >
                            Keep it live
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="compact"
                            disabled={unpublishing}
                            onClick={() => void unpublish()}
                          >
                            {unpublishing ? (
                              <Spinner
                                className="size-3.5"
                                label="Unpublishing"
                              />
                            ) : null}
                            Unpublish
                          </Button>
                        </div>
                      </RowConfirm>
                    ) : null}
                  </DestinationRow>
                  <ShopifyRow />
                </ul>
              </section>
            </div>

            <p className="truncate px-5 pt-4 pb-5 text-type-caption-1 text-heading-04">
              {details}
            </p>

            <div className="flex items-center justify-end gap-2 bg-foreground-01 px-5 py-3.5 divider-t-half dark:bg-surface-primary">
              <Button
                type="button"
                variant="outline"
                size="compact"
                className="rounded-sm px-2.5"
                onClick={() => setModalOpen(false)}
              >
                Done
              </Button>
              <Button asChild size="compact" className="rounded-sm px-3">
                <a href={url} target="_blank" rel="noreferrer">
                  Open page
                </a>
              </Button>
            </div>
          </div>
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
  const shopify = p.destination === "shopify_page";
  const label =
    p.status === "unpublished"
      ? "Unpublished"
      : p.status === "failed"
        ? "Failed"
        : p.status === "pending"
          ? p.action === "unpublish"
            ? "Unpublishing"
            : "Publishing"
          : shopify
            ? "Draft"
            : "Published";
  return (
    <li className="flex flex-col gap-1 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium">
      <div className="flex items-center gap-1.5">
        <span className="rounded-sm bg-foreground-02 px-1.5 text-type-caption-2 text-heading-02">
          {label}
        </span>
        {p.url ? (
          <a
            href={shopify && p.admin_url ? p.admin_url : p.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate text-text-link hover:underline"
          >
            {shopify
              ? `Shopify draft · ${hostAndPath(p.url)}`
              : hostAndPath(p.url)}
          </a>
        ) : (
          <span className="min-w-0 flex-1 text-heading-05">
            {shopify ? "Shopify" : "Vercel"}
          </span>
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
