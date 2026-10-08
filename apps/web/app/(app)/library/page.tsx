import type { Metadata } from "next";

import { PageStub } from "@/components/app/page-stub";
import { LibraryIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return <PageStub title="Library" icon={LibraryIcon} arrivesIn="B1.6" />;
}
