import { WorkerError, getReviewHtml } from "@/lib/api/worker";
import { publicEnv } from "@/lib/env";

/**
 * GET /review/[token]/html: the approved page itself, for the client's review page (B3.6, D119).
 * No sign-in: the worker checks the token. The page runs with scripts off and can't reach this app
 * (the CSP sandbox gives it an opaque origin), as in the team's preview; links it opens in a new
 * tab still work. Kept out of search engines, and its address isn't passed on.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/review/[token]/html">,
) {
  const { token } = await params;
  const quiet = {
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
  };
  let html: string | null;
  try {
    html = await getReviewHtml(token);
  } catch (error) {
    if (error instanceof WorkerError)
      return new Response("This page can’t be shown right now.", {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...quiet },
      });
    throw error;
  }
  if (html === null)
    return new Response("This link isn’t available any more.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...quiet },
    });
  const storage = new URL(publicEnv.supabaseUrl).origin;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...quiet,
      "Content-Security-Policy": [
        "sandbox allow-popups allow-popups-to-escape-sandbox",
        "default-src 'none'",
        `img-src ${storage} https: data:`,
        "style-src 'unsafe-inline' https:",
        `font-src ${storage} https: data:`,
        "frame-ancestors 'self'",
      ].join("; "),
    },
  });
}
