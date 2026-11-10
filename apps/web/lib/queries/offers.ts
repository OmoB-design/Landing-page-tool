import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { brandOffersSchema } from "@/lib/validators/offer";

/** A brand's live offers (B7.3a), loaded when a window that picks one opens. */
export function useBrandOffers(brandId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["brand-offers", brandId],
    queryFn: () => apiFetch(`/api/brands/${brandId}/offers`, brandOffersSchema),
    enabled: enabled && brandId !== null,
    staleTime: 30_000,
  });
}
