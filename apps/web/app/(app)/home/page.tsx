import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountSummary } from "@/components/features/auth/account-summary";

export const metadata: Metadata = { title: "Home" };

// B0.2 placeholder. The app shell and pipeline overview replace this in B0.3.
export default function HomePage() {
  return (
    <main className="flex flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Home</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <AccountSummary />
      </Suspense>
    </main>
  );
}
