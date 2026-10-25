import type { z } from "zod";

/** A failed /api call: the route's message, and its HTTP status (409: changed elsewhere). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

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
    throw new ApiError(
      typeof message === "string" ? message : "Something went wrong.",
      response.status,
    );
  }
  return schema.parse(json);
}
