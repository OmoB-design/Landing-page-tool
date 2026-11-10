"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { OfferIcon } from "@/components/ui/icons";
import {
  FRAME_CLOSE,
  ModalCard,
  ModalFrame,
} from "@/components/ui/modal-stack";
import { cn } from "@/lib/utils";

/**
 * The offer windows (Change offer, a batch's Change offer, Duplicate with offers; B7.3a), drawn as
 * Settings → Connect a Shopify store (owner, 2026-11-10): a white card on the grey frame, its
 * header centred under an icon tile, the lists in the card, the error, Cancel and the action on
 * the frame below.
 */
export function OfferModal({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="block bg-transparent p-0 ring-0 sm:max-w-md"
        closeClassName={FRAME_CLOSE}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function OfferCard({
  title,
  description,
  error,
  actions,
  children,
}: {
  title: string;
  description: string;
  error?: string | null;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <ModalFrame className="max-h-dvh">
      <ModalCard className="flex min-h-0 flex-col rounded-lg pt-2 pb-2.5">
        <div className="flex shrink-0 flex-col items-center gap-3 px-6 pt-6 pb-6 text-center">
          <div className="rounded-md bg-dashboard p-0.5 ring-half ring-stroke dark:bg-surface-primary">
            <div className="flex size-10 items-center justify-center rounded-sm bg-surface-primary ring-half ring-stroke dark:bg-foreground-02">
              <OfferIcon aria-hidden className="size-5 text-heading-01" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-type-body-small font-medium text-heading-01">
              {title}
            </DialogTitle>
            <DialogDescription className="text-type-caption-1 text-heading-05">
              {description}
            </DialogDescription>
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-6 pt-5 pb-4 divider-t-half">
          {children}
        </div>
      </ModalCard>
      <div className="flex shrink-0 items-center gap-2 px-6 py-4">
        {error ? (
          <p
            role="alert"
            className="min-w-0 flex-1 text-type-caption-1 font-medium text-text-danger"
          >
            {error}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        {actions}
      </div>
    </ModalFrame>
  );
}

/** Cancel as the Shopify window's: plain text on the grey frame. */
export function CancelButton(props: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="compact"
      className="text-body hover:bg-foreground-03"
      {...props}
    >
      Cancel
    </Button>
  );
}

/** A list's name in an offer window ("Offer", "Pages"). */
export function ListName({ children }: { children: ReactNode }) {
  return (
    <p className="text-type-caption-1 font-medium text-heading-02">
      {children}
    </p>
  );
}

/** The lists' rows 2 px apart, each its own tile (owner, 2026-11-10). */
export const LIST = "flex flex-col gap-0.5";

/**
 * One row of an offer window's list, framed on its own; the chosen (or ticked) one in a solid ink
 * frame, black (white in dark), so it stands out (owner, 2026-11-10).
 */
export function tile(chosen: boolean): string {
  return cn(
    "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-type-caption-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
    chosen
      ? "bg-foreground-01 ring-1 ring-button-ink"
      : "ring-thin ring-stroke hover:bg-foreground-01",
  );
}
