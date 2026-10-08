import type { z } from "zod";

/** Browser fetch for our /api routes: parses the response with `schema`; throws the route's
 * `{error}` message on failure. */
export async function apiFetch<T extends z.ZodType>(
  url: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (json as { error?: unknown } | null)?.error;
    throw new Error(
      typeof message === "string" ? message : "Something went wrong.",
    );
  }
  return schema.parse(json);
}
