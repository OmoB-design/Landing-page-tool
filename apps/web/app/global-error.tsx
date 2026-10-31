"use client";

import "./globals.css";

import { useEffect } from "react";

/**
 * When even the root layout fails (B1.6c): Next replaces the whole document, so this page brings
 * its own html, body and styles, and stays plain.
 */
export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-surface-primary font-sans text-heading-01">
        <main className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
          <h1 className="text-type-h5 font-semibold">Something went wrong</h1>
          <p className="text-type-body-small text-sub-text">
            LP Platform couldn’t load. Try again in a moment.
            {error.digest ? (
              <span className="block pt-2 text-type-caption-2 text-heading-05">
                Reference: {error.digest}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={reset}
            className="button-primary h-6.5 rounded-md px-2 text-type-caption-1 font-medium text-button-primary-text"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
