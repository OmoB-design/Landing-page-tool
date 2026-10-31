"use client";

import Link from "next/link";
import { useEffect } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";

/**
 * A screen that failed to load (B1.6c): inside the workspace shell, what happened, Try again and
 * Go home, and the error's reference for support. The sidebar and header stay usable.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={AlertIcon}
        title="Something went wrong"
        action={
          <div className="flex gap-2">
            <Button size="compact" onClick={reset}>
              Try again
            </Button>
            <Button asChild variant="outline" size="compact">
              <Link href="/home">Go home</Link>
            </Button>
          </div>
        }
      >
        This page couldn’t load. Try again; if it keeps happening, send us the
        reference below.
        {error.digest ? (
          <span className="block pt-2 text-type-caption-2 text-heading-05">
            Reference: {error.digest}
          </span>
        ) : null}
      </EmptyState>
    </div>
  );
}
