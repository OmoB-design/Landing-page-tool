import type { Metadata } from "next";

import { PageStub } from "@/components/app/page-stub";
import { AnalyticsIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return <PageStub title="Analytics" icon={AnalyticsIcon} arrivesIn="B1.6" />;
}
