import { NextResponse } from "next/server";

import { getApiSession, unauthorized } from "@/lib/auth/api-session";
import { priceChangeLabel } from "@/lib/offers/form";
import { getBrandCurrency, getBrandOffers } from "@/lib/offers/queries";

/** GET /api/brands/[brandId]/offers (B7.3a): the brand's live offers, default first, for the
 * Change offer and Duplicate with offers windows (read through the member's own session). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/brands/[brandId]/offers">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { brandId } = await params;
  const [offers, currency] = await Promise.all([
    getBrandOffers(session.orgId, brandId),
    getBrandCurrency(session.orgId, brandId),
  ]);
  return NextResponse.json({
    offers: offers.map((offer) => ({
      id: offer.id,
      name: offer.name,
      label: priceChangeLabel(offer, currency),
      is_default: offer.is_default,
    })),
  });
}
