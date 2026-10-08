import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { authErrorMessage } from "@/lib/auth/errors";

describe("authErrorMessage", () => {
  it("replaces 'fetch failed' with a service-unreachable message", () => {
    const error = new AuthRetryableFetchError("fetch failed", 0);
    expect(authErrorMessage(error, "sign-in", false)).toBe(
      "We can't reach the sign-in service right now. Try again in a moment.",
    );
  });

  it("adds a local-dev hint about Docker and Supabase in development", () => {
    const error = new AuthRetryableFetchError("fetch failed", 0);
    expect(authErrorMessage(error, "sign-up", true)).toMatch(/pnpm db:start/);
  });

  it("treats a 5xx from the auth service as unreachable", () => {
    const error = new AuthApiError("upstream error", 502, "unexpected_failure");
    expect(authErrorMessage(error, "sign-in", false)).toMatch(/can't reach/);
  });

  it("explains wrong credentials without echoing Supabase's wording", () => {
    const error = new AuthApiError(
      "Invalid login credentials",
      400,
      "invalid_credentials",
    );
    expect(authErrorMessage(error, "sign-in", false)).toBe(
      "That email and password don't match. Check them, or email yourself a sign-in link.",
    );
  });

  it("points an existing email to sign in", () => {
    const error = new AuthApiError(
      "User already registered",
      422,
      "user_already_exists",
    );
    expect(authErrorMessage(error, "sign-up", false)).toMatch(
      /Sign in instead/,
    );
  });

  it("explains a magic link for an unknown email", () => {
    const error = new AuthApiError(
      "Signups not allowed for otp",
      422,
      "otp_disabled",
    );
    expect(authErrorMessage(error, "magic-link", false)).toMatch(/no account/i);
  });

  it("asks the user to wait when rate limited", () => {
    const error = new AuthApiError(
      "Email rate limit exceeded",
      429,
      "over_email_send_rate_limit",
    );
    expect(authErrorMessage(error, "magic-link", false)).toMatch(
      /Wait a minute/,
    );
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(authErrorMessage(new Error("boom"), "sign-in", false)).toBe(
      "Something went wrong. Try again in a moment.",
    );
  });
});
