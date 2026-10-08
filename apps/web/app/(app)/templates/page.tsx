import type { Metadata } from "next";

import { PageStub } from "@/components/app/page-stub";
import { TemplatesIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return <PageStub title="Templates" icon={TemplatesIcon} arrivesIn="B1.1" />;
}
