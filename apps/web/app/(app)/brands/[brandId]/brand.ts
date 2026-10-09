import { notFound } from "next/navigation";

import { getSessionContext } from "@/lib/auth/session";
import { getBrand } from "@/lib/brands/queries";

/** The brand for a /brands/[brandId] route, or the 404 page (also for other orgs' brands). */
export async function loadBrand(params: Promise<{ brandId: string }>) {
  const { brandId } = await params;
  const { currentOrg } = await getSessionContext();
  const brand = await getBrand(currentOrg.id, brandId);
  if (!brand) notFound();
  return brand;
}
