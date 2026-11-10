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
  band,
  children,
}: {
  title: string;
  description: string;
  error?: string | null;
  actions: ReactNode;
  /**
   * The offer list, in a band across the card as the Shopify window's steps (Dashboard grey, black
   * in dark), so it stands out from the card (owner, 2026-11-10).
   */
  band?: { title: string; content: ReactNode };
  children?: ReactNode;
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
        <div className="flex min-h-0 flex-col overflow-y-auto">
          {band ? (
            <section className="flex flex-col gap-2 bg-dashboard px-6 py-4 text-type-caption-1 divider-y-half dark:bg-surface-primary">
              <h3 className="font-medium text-heading-02">{band.title}</h3>
              {band.content}
            </section>
          ) : null}
          {children ? (
            <div className="flex flex-col gap-6 p-6">{children}</div>
          ) : null}
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
 * One row of an offer window's list, framed on its own: white on the band (the card's grey in
 * dark); the chosen or ticked one with a firmer edge (its dot or box says which).
 */
export function tile(chosen: boolean): string {
  return cn(
    "flex items-center gap-2 rounded-md bg-surface-primary px-2.5 py-2 text-left text-type-caption-1 outline-none hover:bg-foreground-01 focus-visible:ring-2 focus-visible:ring-ring dark:bg-surface-modal dark:hover:bg-foreground-02",
    chosen ? "ring-1 ring-sub-text" : "ring-thin ring-stroke",
  );
}
