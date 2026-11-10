"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { GroupedList } from "@/components/app/grouped-list";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OfferIcon } from "@/components/ui/icons";
import { PlusFigmaIcon, RowMoreIcon } from "@/components/ui/lp-icons";
import {
  archiveOffer,
  createOffer,
  makeDefaultOffer,
  updateOffer,
} from "@/lib/offers/actions";
import {
  type OfferRow,
  checkoutLabel,
  offerToForm,
  priceChangeLabel,
} from "@/lib/offers/form";
import type { OfferFormValues } from "@/lib/validators/offer";

import { OfferDialog } from "./offer-dialog";

const ITEM =
  "rounded-xsm px-1 py-0.5 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02";

type Editing = { offer: OfferRow | null } | null;

/**
 * A brand's Offers tab (B7.2a, D146; no Figma frame, drawn from the Products and Pages tabs): a bar
 * with how many offers there are and New offer, then a 48 px row per offer: its tag, the name
 * (Default beside the one new pages start with), the promo line, how the customer gets it, the
 * price change and how many pages use it, then the ⋯ (Edit, Make default, Archive). A row opens
 * Edit. Without offers, the empty state offers New offer.
 */
export function OffersView({
  brandId,
  brandName,
  offers,
  currency,
}: {
  brandId: string;
  brandName: string;
  offers: OfferRow[];
  currency: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [archiving, setArchiving] = useState<OfferRow | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether the brand has a default already: from the list, or from a save the list hasn't caught
  // up with yet (a second New offer straight after the first mustn't think there's none).
  const [madeDefault, setMadeDefault] = useState(false);
  const hasDefault = madeDefault || offers.some((offer) => offer.is_default);

  const save = async (values: OfferFormValues) => {
    const offer = editing?.offer ?? null;
    const result = offer
      ? await updateOffer(offer.id, values)
      : await createOffer(brandId, values);
    if (result.ok) {
      if (result.isDefault) setMadeDefault(true);
      setEditing(null);
      toast.success(offer ? "Offer saved" : `${values.name} added`);
      if (result.error) toast.error(result.error);
      router.refresh();
    }
    return result;
  };
  const makeDefault = async (offer: OfferRow) => {
    const result = await makeDefaultOffer(offer.id);
    if (result.error) toast.error(result.error);
    else {
      toast.success(`New pages start with ${offer.name}`);
      router.refresh();
    }
  };
  const archive = async (offer: OfferRow) => {
    setBusy(true);
    const result = await archiveOffer(offer.id);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setArchiving(null);
    toast.success(`${offer.name} archived`);
    router.refresh();
  };
  const newOffer = (
    <Button
      size="compact"
      className="h-7.5"
      onClick={() => setEditing({ offer: null })}
    >
      <PlusFigmaIcon />
      New offer
    </Button>
  );

  return (
    <>
      {offers.length === 0 ? (
        <EmptyState icon={OfferIcon} title="No offers yet" action={newOffer}>
          Save the deals {brandName} runs (a percent off, free shipping, a gift)
          and pick one for each page.
        </EmptyState>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 pb-3.5 divider-b-thin">
            <p className="text-type-body-small font-medium text-sub-text">
              {offers.length === 1 ? "1 offer" : `${offers.length} offers`}
            </p>
            {newOffer}
          </div>
          <div className="mt-3">
            <GroupedList label="Offers">
              <ul role="list" className="flex flex-col gap-0.5">
                {offers.map((offer) => (
                  <OfferListRow
                    key={offer.id}
                    offer={offer}
                    currency={currency}
                    onEdit={() => setEditing({ offer })}
                    onMakeDefault={() => void makeDefault(offer)}
                    onArchive={() => setArchiving(offer)}
                  />
                ))}
              </ul>
            </GroupedList>
          </div>
        </>
      )}
      <OfferDialog
        open={editing !== null}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        initial={
          editing?.offer
            ? offerToForm(editing.offer)
            : editing
              ? {
                  name: "",
                  price_change: "none",
                  price_value: "",
                  checkout: "none",
                  code: "",
                  promo_text: "",
                  details: "",
                  // A brand's first offer is its default anyway.
                  is_default: !hasDefault,
                }
              : null
        }
        editing={Boolean(editing?.offer)}
        currency={currency}
        onSave={save}
      />
      <Dialog
        open={archiving !== null}
        onOpenChange={(open) => (open ? null : setArchiving(null))}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{`Archive ${archiving?.name ?? "the offer"}?`}</DialogTitle>
            <DialogDescription>
              {archiving?.is_default
                ? "It won't be offered for new pages, and new pages start with no offer until you pick another default. "
                : "It won't be offered for new pages. "}
              Pages built with it keep it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive-secondary"
              size="sm"
              disabled={busy}
              onClick={() => archiving && void archive(archiving)}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OfferListRow({
  offer,
  currency,
  onEdit,
  onMakeDefault,
  onArchive,
}: {
  offer: OfferRow;
  currency: string;
  onEdit: () => void;
  onMakeDefault: () => void;
  onArchive: () => void;
}) {
  const checkout = checkoutLabel(offer);
  return (
    <li className="group/row flex h-12 items-center gap-3 pr-4 divider-b-thin hover:bg-foreground-01 has-focus-visible:bg-foreground-01">
      <button
        type="button"
        data-list-nav=""
        onClick={onEdit}
        aria-label={`Edit ${offer.name}`}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-4 text-left -outline-offset-2"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-xsm bg-foreground-01 text-icon-system">
          <OfferIcon aria-hidden className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-type-body-small font-medium text-heading-01">
            {offer.name}
          </span>
          {offer.is_default ? (
            <span className="flex shrink-0 items-center rounded-sm px-1.5 text-type-caption-1 text-sub-text ring-thin ring-stroke">
              Default
            </span>
          ) : null}
          {offer.promo_text ? (
            <span className="hidden min-w-0 truncate text-type-caption-1 text-sub-text lg:inline">
              {offer.promo_text}
            </span>
          ) : null}
        </span>
        <span className="hidden shrink-0 items-center gap-3 md:flex">
          {checkout ? (
            <span className="text-type-caption-1 text-sub-text">
              {checkout}
            </span>
          ) : null}
          <span className="text-type-caption-1 font-medium text-heading-02 tabular-nums">
            {priceChangeLabel(offer, currency)}
          </span>
          <span className="w-16 text-right text-type-caption-1 text-sub-text tabular-nums">
            {offer.pages === 1 ? "1 page" : `${offer.pages} pages`}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${offer.name}`}
            className="flex size-4.5 shrink-0 items-center justify-center rounded-xsm bg-foreground-03 text-body opacity-0 outline-none group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:opacity-100 data-open:opacity-100"
          >
            <RowMoreIcon />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={5}
          className="flex w-menu-row flex-col gap-0.5 rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline"
        >
          <DropdownMenuItem className={ITEM} onSelect={onEdit}>
            Edit
          </DropdownMenuItem>
          {offer.is_default ? null : (
            <DropdownMenuItem className={ITEM} onSelect={onMakeDefault}>
              Make default
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className={ITEM} onSelect={onArchive}>
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
