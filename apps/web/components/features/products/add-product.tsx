"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authLinkClass } from "@/components/app/auth-frame";
import { JobSteps } from "@/components/app/job-steps";
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

/** Products tab: paste a product page → live pull steps → the product is saved to the brand. */
export function AddProduct({
  brandId,
  placeholder,
}: {
  brandId: string;
  placeholder: string;
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

  const pull = () => {
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

  const busy =
    startJob.isPending || job?.status === "queued" || job?.status === "running";
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          pull();
        }}
        noValidate
      >
        <Field data-invalid={urlError ? true : undefined}>
          <FieldLabel htmlFor="product-url">Product page</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="product-url"
              type="url"
              className="h-9"
              placeholder={placeholder}
              value={url}
              aria-invalid={urlError ? true : undefined}
              aria-describedby={
                urlError ? "product-url-error" : "product-url-hint"
              }
              onChange={(event) => setUrl(event.target.value)}
              disabled={busy}
            />
            <Button type="submit" disabled={busy} className="h-9 px-4">
              Add product
            </Button>
          </div>
          {urlError ? (
            <FieldError id="product-url-error">{urlError}</FieldError>
          ) : (
            <FieldDescription id="product-url-hint">
              We read the price, images, options and subscription offers, then
              write the selling points. Adding the same product again updates
              it.
            </FieldDescription>
          )}
        </Field>
        {startJob.error ? (
          <p role="alert" className="text-sm text-danger">
            {startJob.error.message}
          </p>
        ) : null}
      </form>

      {job ? (
        <JobSteps title="Adding the product" steps={PULL_STEPS} job={job} />
      ) : null}

      {pulled ? (
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
      ) : null}
    </div>
  );
}

/** Re-renders the server components (the product list) once when a job finishes. */
export function usePageRefresh(finishedJobId: string | null) {
  const router = useRouter();
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (finishedJobId && refreshed.current !== finishedJobId) {
      refreshed.current = finishedJobId;
      router.refresh();
    }
  }, [finishedJobId, router]);
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
      <p role="status" className="text-base">
        {created ? "Added" : "Updated"} {name}.{" "}
        <Link
          href={`/brands/${brandId}/products/${productId}`}
          className={authLinkClass}
        >
          Open it
        </Link>
      </p>
      {notes.map((note) => (
        <Alert key={note} className="border-warning/30 bg-warning-soft">
          <AlertIcon aria-hidden className="text-warning" />
          <AlertDescription className="text-fg">{note}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
