"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { useBrandOffers } from "@/lib/queries/offers";
import { cn } from "@/lib/utils";
import { variantsMadeSchema } from "@/lib/validators/offer";

/**
 * Duplicate with offers (B7.3a, D147; a page's ⋯): the brand's offers other than the page's own,
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
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="max-h-dvh gap-0 overflow-y-auto p-0 sm:max-w-md">
        <div className="flex flex-col gap-5 px-6 pt-6 pb-6">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-type-body-small font-medium text-heading-01">
              Duplicate with offers
            </DialogTitle>
            <DialogDescription className="text-type-caption-1 text-heading-05">
              {`A copy of ${pageKey} for each offer you tick, the same page with only the deal changed: its prices, promo line, buttons and the lines about it.`}
            </DialogDescription>
          </div>
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
            <div
              role="group"
              aria-label="Offers"
              className="flex flex-col gap-1"
            >
              {others.map((offer) => {
                const on = ticked.includes(offer.id);
                return (
                  <label
                    key={offer.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-type-caption-1 ring-thin ring-stroke hover:bg-foreground-01",
                      on && "bg-foreground-01 ring-stroke-strong",
                    )}
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
          )}
        </div>
        <div className="flex items-center gap-2 px-6 py-4 divider-t-half">
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
          <Button
            type="button"
            variant="outline"
            size="compact"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </Button>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
