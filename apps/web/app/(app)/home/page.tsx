import type { Metadata } from "next";

import { PageStub } from "@/components/app/page-stub";
import { HomeIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return <PageStub title="Home" icon={HomeIcon} />;
}
