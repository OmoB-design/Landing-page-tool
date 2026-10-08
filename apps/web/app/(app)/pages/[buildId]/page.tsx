import type { Metadata } from "next";

import { PageStub } from "@/components/app/page-stub";
import { PagesIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Review desk" };

/** Placeholder so rows in the Pages list open something; the review desk arrives in B1.4. */
export default function ReviewDeskPage() {
  return <PageStub title="Review desk" icon={PagesIcon} arrivesIn="B1.4" />;
}
