"use client";

import { useState } from "react";

import {
  StatusGlyph,
  type StatusGlyphKind,
} from "@/components/app/status-glyph";
import { Button } from "@/components/ui/button";
import { ApprovedFigmaIcon, StatusRingIcon } from "@/components/ui/lp-icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { STATUS_LABELS } from "@/lib/builds/desk";

import { useDesk } from "./desk-context";
import { usePublishOptional } from "./publish-context";

/**
 * The page's status in the header (D84; Figma Review desk): Approve (blue) while it needs review,
 * or Back to review once approved, then the status chip. With claims marked Fix, Approve asks
 * first: approving is allowed, publishing is where they block (B1.5).
 */
export function StatusActions({ fixCount }: { fixCount: number }) {
  const { desk, setStatus, pending, redrafting } = useDesk();
  const publish = usePublishOptional();
  const status = desk.build.status;
  const busy = pending !== null || redrafting !== null;
  return (
    <div className="flex items-center gap-1.5">
      {status === "needs_review" ? (
        <ApproveButton
          fixCount={fixCount}
          busy={pending === "status"}
          disabled={busy}
          onApprove={() => setStatus("approved")}
        />
      ) : status === "approved" ? (
        <Button
          type="button"
          variant="outline"
          size="compact"
          disabled={busy}
          onClick={() => setStatus("needs_review")}
          className="px-3"
        >
          {pending === "status" ? (
            <Spinner className="size-3.5" label="Saving" />
          ) : null}
          Back to review
        </Button>
      ) : null}
      {/* A live page shows Live instead (D89); without publishing, the chip says Published. */}
      {status === "published" && publish?.publishing.live ? null : (
        <StatusChip status={status} />
      )}
    </div>
  );
}

/** The status chip (Figma Review desk, Desk/Status chip): 24 px, Foreground-01, 6 px corners, the
 * glyph (the Needs review ring, 16 px; the Approved tick, 12 px; both Spot-500-Blue) and the name.
 * On a phone only the glyph shows (the name stays for screen readers). */
export function StatusChip({ status }: { status: string }) {
  return (
    <span className="flex h-6 items-center gap-1 rounded-sm bg-foreground-01 pr-1 pl-1 text-type-caption-1 font-medium whitespace-nowrap text-heading-02 sm:pr-1.5">
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center text-spot-500-blue"
      >
        {status === "approved" ? (
          <ApprovedFigmaIcon />
        ) : status === "needs_review" ? (
          <StatusRingIcon className="size-4" />
        ) : (
          <StatusGlyph status={status as StatusGlyphKind} />
        )}
      </span>
      <span className="max-sm:sr-only">{STATUS_LABELS[status] ?? status}</span>
    </span>
  );
}

/** The thin rule between header actions (Figma Review desk: 1.5 × 15 px, Foreground-02). */
export function HeaderDivider() {
  return <span aria-hidden className="header-divider" />;
}

function ApproveButton({
  fixCount,
  busy,
  disabled,
  onApprove,
}: {
  fixCount: number;
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const button = (
    <Button
      type="button"
      size="compact"
      disabled={disabled}
      onClick={fixCount > 0 ? undefined : onApprove}
      className="px-3"
    >
      {busy ? <Spinner className="size-3.5" label="Approving" /> : null}
      Approve
    </Button>
  );
  if (fixCount === 0) return button;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-menu-header flex-col gap-2.5 rounded-md bg-surface-primary p-3 text-type-caption-1 font-medium shadow-float edge-hairline"
      >
        <p className="text-heading-01">
          {fixCount === 1
            ? "1 claim is marked Fix."
            : `${fixCount} claims are marked Fix.`}
        </p>
        <p className="text-heading-05">
          You can approve the page now; publishing stays blocked until they’re
          fixed.
        </p>
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
            onClick={() => {
              setOpen(false);
              onApprove();
            }}
          >
            Approve anyway
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
