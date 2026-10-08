import type { Metadata } from "next";

import { PageStub } from "@/components/app/page-stub";
import { SettingsIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageStub title="Settings" icon={SettingsIcon} arrivesIn="B1.5–B1.6" />
  );
}
