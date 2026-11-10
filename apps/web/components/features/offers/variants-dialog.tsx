"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { useBrandOffers } from "@/lib/queries/offers";
import { variantsMadeSchema } from "@/lib/validators/offer";

import {
  CancelButton,
  LIST,
  ListName,
  OfferCard,
  OfferModal,
  tile,
} from "./offer-modal";

/**
 * Duplicate with offers (B7.3a, D147; a page's ⋯; drawn as Settings → Connect a Shopify store):
 * the brand's offers other than the page's own,
 * to tick; one copy per ticked offer, each then changed to its offer in the background (its job
 * toast follows it). The copies hang under the original as "Copy 2 · Ten off".
 */
export function VariantsDialog({
  open,
  onOpenChange,
  buildId,
  pageKey,
  brandId,
  currentOfferId,
  onMade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildId: string;
  pageKey: string;
  brandId: string;
  currentOfferId: string | null;
  onMade?: () => void;
}) {
  const router = useRouter();
  const offers = useBrandOffers(brandId, open);
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = (offers.data?.offers ?? []).filter(
    (o) => o.id !== currentOfferId,
  );
  const close = () => {
    onOpenChange(false);
    setTicked([]);
    setError(null);
  };
  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await apiFetch(
        `/api/builds/${buildId}/variants`,
        variantsMadeSchema,
        {
          method: "POST",
          body: JSON.stringify({ offer_ids: ticked }),
        },
      );
      const n = made.copies.length;
      toast.success(n === 1 ? "1 variant made" : `${n} variants made`, {
        description: made.copies.map((c) => c.key).join(", "),
      });
      router.refresh();
      onMade?.();
      close();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t make the variants.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <OfferModal open={open} onOpenChange={(next) => (next ? null : close())}>
      <OfferCard
        title="Duplicate with offers"
        description={`A copy of ${pageKey} for each offer you tick. Only the deal changes.`}
        error={error}
        actions={
          <>
            <CancelButton disabled={busy} onClick={close} />
            <Button
              type="button"
              size="compact"
              disabled={busy || ticked.length === 0}
              onClick={() => void make()}
            >
              {busy ? (
                <Spinner className="size-3.5" label="Making the copies" />
              ) : null}
              {ticked.length > 1
                ? `Make ${ticked.length} copies`
                : "Make the copy"}
            </Button>
          </>
        }
      >
        {offers.isPending ? (
          <p className="flex items-center gap-2 text-type-caption-1 text-heading-05">
            <Spinner className="size-3.5" label="Loading offers" />
            Loading the brand’s offers…
          </p>
        ) : others.length === 0 ? (
          <p className="text-type-caption-1 text-heading-05">
            The brand has no other offers yet. Add some on its Offers tab.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <ListName>Offers</ListName>
            <div role="group" aria-label="Offers" className={LIST}>
              {others.map((offer) => {
                const on = ticked.includes(offer.id);
                return (
                  <label
                    key={offer.id}
                    className={`${tile(on)} cursor-pointer`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(event) =>
                        setTicked((all) =>
                          event.target.checked
                            ? [...all, offer.id]
                            : all.filter((id) => id !== offer.id),
                        )
                      }
                      className="size-3.5 accent-spot-500-blue"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-heading-01">
                      {offer.name}
                    </span>
                    <span className="shrink-0 text-sub-text">
                      {offer.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </OfferCard>
    </OfferModal>
  );
}
