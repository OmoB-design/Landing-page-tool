"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { LoadingIcon, PagesIcon } from "@/components/ui/icons";
import { startTestBuild } from "@/lib/builds/actions";

/**
 * Temporary (B0.6a): builds a page for this product from the test template and opens it.
 * The create wizard (B1.2) replaces it.
 */
export function TestBuildButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          className="h-8"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await startTestBuild(productId);
              if (result.buildId) router.push(`/pages/${result.buildId}`);
              else setError(result.error ?? "Couldn't start the build.");
            })
          }
        >
          {pending ? (
            <LoadingIcon
              aria-hidden
              className="animate-spin motion-reduce:animate-spin-slow"
            />
          ) : (
            <PagesIcon aria-hidden />
          )}
          Build a test page
        </Button>
        <span className="text-sm text-fg-muted">
          Temporary: uses the test template until the create wizard arrives.
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
