"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";

import { authLinkClass } from "@/components/app/auth-frame";
import { JobSteps } from "@/components/app/job-steps";
import { BrandColumn, BrandFrame } from "@/components/app/brand-frame";
import { SkeletonButton, SkeletonField } from "@/components/app/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { AlertIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { usePageRefresh } from "@/lib/hooks/use-page-refresh";
import { useJob, useStartJob } from "@/lib/queries/jobs";
import {
  productPullResultSchema,
  productUrlSchema,
} from "@/lib/validators/product";

/** The worker's product_pull steps (services/worker/app/jobs/kinds/product_pull.py). */
export const PULL_STEPS = [
  { id: "store", label: "Read the store's product data" },
  { id: "page", label: "Load the product page" },
  { id: "images", label: "Save the images" },
  { id: "details", label: "Write the product details" },
  { id: "save", label: "Save the product" },
];

/**
 * The Products tab (Figma Brands Details: Brands/product page, light and dark), around the list
 * it's given: in the frame's header, a 400 px form (Product page, then a full-width Add product);
 * below the line, the 300 px loader while the product is read, what was added, then the list.
 */
export function AddProduct({
  brandId,
  placeholder,
  children,
}: {
  brandId: string;
  placeholder: string;
  children: ReactNode;
}) {
  const startJob = useStartJob();
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useJob(jobId);
  const result =
    job?.status === "succeeded"
      ? productPullResultSchema.safeParse(job.result)
      : null;
  const pulled = result?.success ? result.data : null;
  usePageRefresh(job?.status === "succeeded" ? job.id : null);
  const busy =
    startJob.isPending || job?.status === "queued" || job?.status === "running";

  const pull = () => {
    if (busy) return;
    const parsed = productUrlSchema.safeParse(url);
    if (!parsed.success) {
      setUrlError(parsed.error.issues[0]?.message ?? "Check the address.");
      return;
    }
    setUrlError(null);
    startJob.mutate(
      {
        kind: "product_pull",
        payload: { brand_id: brandId, url: parsed.data },
      },
      { onSuccess: ({ job: started }) => setJobId(started.id) },
    );
  };

  return (
    <BrandFrame
      header={
        <form
          className="mx-auto flex w-full max-w-100 flex-col gap-4 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            pull();
          }}
          noValidate
        >
          <Field data-invalid={urlError ? true : undefined}>
            <FieldLabel htmlFor="product-url">Product page</FieldLabel>
            <Input
              id="product-url"
              type="url"
              placeholder={placeholder}
              value={url}
              aria-invalid={urlError ? true : undefined}
              aria-describedby={
                urlError ? "product-url-error" : "product-url-hint"
              }
              onChange={(event) => setUrl(event.target.value)}
              // It keeps its look while the product is read; it just can't change mid-way.
              readOnly={busy}
            />
            {urlError ? (
              <FieldError id="product-url-error">{urlError}</FieldError>
            ) : (
              <FieldDescription id="product-url-hint">
                Adding the same product again updates it.
              </FieldDescription>
            )}
          </Field>
          <Button
            type="submit"
            size="compact"
            className="h-8.5 w-full"
            aria-disabled={busy || undefined}
          >
            Add product
          </Button>
          {startJob.error ? (
            <p role="alert" className="text-type-caption-1 text-text-danger">
              {startJob.error.message}
            </p>
          ) : null}
        </form>
      }
    >
      {job ? (
        <div className="flex justify-center px-6 py-1.5">
          <JobSteps
            title="Adding the product"
            steps={PULL_STEPS}
            job={job}
            className="w-75 [&_.ui-progress]:pb-6.5"
          />
        </div>
      ) : null}
      {pulled ? (
        <BrandColumn width="list">
          <PullResult
            brandId={brandId}
            productId={pulled.product_id}
            name={pulled.name}
            created={pulled.created}
            notes={[
              ...pulled.warnings,
              ...(pulled.ai === "mock"
                ? [
                    "The selling points are placeholders: AI calls are in mock mode.",
                  ]
                : []),
            ]}
          />
        </BrandColumn>
      ) : null}
      {children}
    </BrandFrame>
  );
}

function PullResult({
  brandId,
  productId,
  name,
  created,
  notes,
}: {
  brandId: string;
  productId: string;
  name: string;
  created: boolean;
  notes: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-type-body-small">
        {created ? "Added" : "Updated"} {name}.{" "}
        <Link
          href={`/brands/${brandId}/products/${productId}`}
          className={authLinkClass}
        >
          Open it
        </Link>
      </p>
      {notes.map((note) => (
        <Alert
          key={note}
          className="border-spot-500-yellow/30 bg-highlight-yellow-50"
        >
          <AlertIcon aria-hidden className="text-text-warning" />
          <AlertDescription className="text-body">{note}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

/** The Products tab while the brand loads: the same form, its field and button not ready yet. */
export function AddProductSkeleton({ children }: { children: ReactNode }) {
  return (
    <BrandFrame
      header={
        <div
          aria-hidden
          className="mx-auto flex w-full max-w-100 flex-col gap-4 py-1.5"
        >
          <SkeletonField
            label="Product page"
            hint="Adding the same product again updates it."
            value="62%"
          />
          <SkeletonButton width="100%" height={34} radius="var(--radius-md)" />
        </div>
      }
    >
      {children}
    </BrandFrame>
  );
}
