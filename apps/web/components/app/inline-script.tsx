"use client";

/**
 * An inline script that runs once from the server HTML, before first paint. On the client React
 * sees `type="text/plain"`, so it neither re-runs it nor warns about rendering a <script>.
 * Pattern from Next's "Preventing flash before hydration" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
