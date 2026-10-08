import type { Metadata } from "next";

import { PageStub } from "@/components/app/page-stub";
import { PagesIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Review desk" };

// The shell's active-link state reads the URL, which for a dynamic route like this one is only
// known at request time, so this segment may block instead of prerendering a static shell.
// Follow-up (before B0.5's /brands/[brandId]): move those URL reads into <Suspense> in the shell
// and remove this opt-out. See node_modules/next/dist/docs/.../migrating-to-cache-components.md.
export const instant = false;

/** Placeholder so rows in the Pages list open something; the review desk arrives in B1.4. */
export default function ReviewDeskPage() {
  return <PageStub title="Review desk" icon={PagesIcon} arrivesIn="B1.4" />;
}
