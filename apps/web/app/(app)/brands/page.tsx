import type { Metadata } from "next";

import { PageStub } from "@/components/app/page-stub";
import { BrandsIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Brands" };

export default function BrandsPage() {
  return <PageStub title="Brands" icon={BrandsIcon} arrivesIn="B0.5" />;
}
