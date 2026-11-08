import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { BuddyLab } from "@/components/features/dev/buddy-lab";

export const metadata: Metadata = { title: "Buddy" };

/** /dev/buddy (development only): Buddy's face turning, his shake and his recording morph (B3.1h). */
export default function BuddyPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <>
      <PageHeader title="Buddy" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-8 px-6 pt-12 pb-40">
        <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
          Buddy
        </h1>
        <BuddyLab />
      </div>
    </>
  );
}
