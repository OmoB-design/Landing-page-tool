import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { InputFieldShowcase } from "@/components/features/dev/input-field-showcase";

export const metadata: Metadata = { title: "Input Field" };

/** /dev/inputs (development only): every Input Field type and state, to check against Figma. */
export default function InputsPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <>
      <PageHeader title="Input Field" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-8 px-6 py-12">
        <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
          Input Field
        </h1>
        <InputFieldShowcase />
      </div>
    </>
  );
}
