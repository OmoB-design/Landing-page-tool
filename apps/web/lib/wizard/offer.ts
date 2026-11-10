import type { WizardData, WizardOffer } from "./queries";

/** The offer a new page will sell (B7.2b): the one picked, none ("none"), or else the brand's
 * default; null when it has none. An offer of another brand counts as not picked. */
export function chosenOffer(
  data: Pick<WizardData, "offers">,
  state: { brand: string | null; offer: string | null },
): WizardOffer | null {
  if (!state.brand || state.offer === "none") return null;
  const mine = data.offers.filter((o) => o.brandId === state.brand);
  return (
    mine.find((o) => o.id === state.offer) ??
    mine.find((o) => o.isDefault) ??
    null
  );
}
