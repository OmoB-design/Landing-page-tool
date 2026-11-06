"use client";

import { format, formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { LinkIcon } from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { MorphText } from "@/components/ui/text-morph";
import { useShare, useShareAction } from "@/lib/queries/share";

import { useDesk } from "./desk-context";

function day(date: string) {
  return format(new Date(date), "d MMM");
}

function hostAndPath(url: string) {
  return url.replace(/^https?:\/\//, "");
}

/**
 * Client link (B3.6, D119; no Figma frame yet, styled as the header's other small cards): in the
 * review desk's header once the page has an approved version. Make link gives an address anyone
 * can open without signing in, showing the approved version on desktop and phone; it's copied as
 * it's made. The card shows the address with Copy, which version it shows, when it expires, how
 * often it's been opened, and Turn off (asks first). An edit after approval doesn't reach the
 * link until the page is approved again; the card says so.
 */
export function ClientLink() {
  const { desk } = useDesk();
  const { id, status, page_version: version } = desk.build;
  const share = useShare(id, status, version);
  const action = useShareAction(id, status, version);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const approved = status === "approved" || status === "published";
  if (!approved && !share.data?.can_share) return null;

  const copy = (url: string, made: boolean) =>
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success(made ? "Link made and copied" : "Link copied");
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() =>
        toast(made ? "Link made. Copy it from the card." : "Couldn’t copy."),
      );
  const make = () =>
    action.mutate("make", {
      onSuccess: (next) => {
        if (next.url) copy(next.url, true);
      },
      onError: (error) => toast.error(error.message),
    });
  const turnOff = () =>
    action.mutate("off", {
      onSuccess: () => {
        setConfirming(false);
        toast.success("Link turned off");
      },
      onError: (error) => toast.error(error.message),
    });

  const data = share.data;
  const link = data?.link ?? null;
  const live = link !== null && !link.expired && data?.url;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="compact" className="px-3">
          <LinkIcon aria-hidden className="size-3.5" />
          Client link
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-80 flex-col gap-3 rounded-md bg-surface-primary p-3 text-type-caption-1 font-medium shadow-float edge-hairline"
      >
        <div className="flex flex-col gap-0.5">
          <p className="text-heading-01">Client link</p>
          <p className="text-heading-05">
            Anyone with the link sees the approved version, on desktop and
            phone, without signing in.
          </p>
        </div>

        {share.isPending ? (
          <div className="flex h-7 items-center">
            <Spinner className="size-3.5" label="Loading the link" />
          </div>
        ) : share.isError ? (
          <p className="text-heading-02">{share.error.message}</p>
        ) : data ? (
          <>
            {live ? (
              <>
                <div className="flex items-center gap-1.5">
                  <a
                    href={data.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-1 items-center rounded-sm bg-foreground-02 px-2.5 py-1.5 font-address text-type-caption-1 leading-4 text-text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">
                      {hostAndPath(data.url ?? "")}
                    </span>
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="compact"
                    onClick={() => copy(data.url ?? "", false)}
                    aria-label={copied ? "Copied" : "Copy the link"}
                  >
                    <MorphText>{copied ? "Copied" : "Copy"}</MorphText>
                  </Button>
                </div>
                <ul className="flex flex-col gap-1 text-heading-05">
                  {data.approved_at ? (
                    <li>
                      Shows the version approved on {day(data.approved_at)}
                    </li>
                  ) : null}
                  <li>Expires on {day(link.expires_at)}</li>
                  <li>
                    {link.views === 0
                      ? "Not opened yet"
                      : `Opened ${link.views === 1 ? "once" : `${link.views} times`}${
                          link.last_viewed_at
                            ? `, last ${formatDistanceToNowStrict(new Date(link.last_viewed_at), { addSuffix: true })}`
                            : ""
                        }`}
                  </li>
                </ul>
              </>
            ) : (
              <p className="text-heading-05">
                {link?.expired
                  ? `The last link expired on ${day(link.expires_at)}. A new one works for 30 days.`
                  : data.approved_at
                    ? `It will show the version approved on ${day(data.approved_at)}, for 30 days.`
                    : "It will show the page as approved now, for 30 days."}
              </p>
            )}

            {data.changed_since ? (
              <p className="rounded-sm bg-foreground-02 px-2.5 py-2 text-heading-02">
                The page has changed since it was approved. Approve it again to
                show the changes on the link.
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-1.5">
              {live ? (
                confirming ? (
                  <>
                    <span className="mr-auto text-heading-05">
                      It stops working at once.
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="compact"
                      disabled={action.isPending}
                      onClick={turnOff}
                    >
                      {action.isPending ? (
                        <Spinner className="size-3.5" label="Turning off" />
                      ) : null}
                      Turn off
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    onClick={() => setConfirming(true)}
                  >
                    Turn off link
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  size="compact"
                  disabled={action.isPending}
                  onClick={make}
                >
                  {action.isPending ? (
                    <Spinner className="size-3.5" label="Making the link" />
                  ) : null}
                  {link?.expired ? "Make a new link" : "Make link"}
                </Button>
              )}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
