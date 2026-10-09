"use client";

import { useRouter } from "next/navigation";

import { toast } from "@/components/app/toaster";
import { updateBrand } from "@/lib/brands/actions";
import type { BrandFormValues } from "@/lib/validators/brand";

import { BrandForm } from "./brand-form";

/** Brand DNA tab: edit and save every brand field. */
export function BrandDnaForm({
  brandId,
  defaultValues,
}: {
  brandId: string;
  defaultValues: BrandFormValues;
}) {
  const router = useRouter();
  return (
    <BrandForm
      defaultValues={defaultValues}
      submitLabel="Save changes"
      onSubmit={async (values) => {
        const result = await updateBrand(brandId, values);
        if (result.ok) {
          toast.success("Brand saved");
          router.refresh();
        }
        return result;
      }}
    />
  );
}
