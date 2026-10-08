import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

export type AuthFlow = "sign-in" | "sign-up" | "magic-link";

const UNREACHABLE =
  "We can't reach the sign-in service right now. Try again in a moment.";
// Local development: the usual cause is Docker Desktop or the Supabase stack being stopped.
const UNREACHABLE_DEV = `${UNREACHABLE} (Local dev: is Docker running? Start Supabase with pnpm db:start.)`;

/**
 * A plain-language message for a Supabase Auth error, by error code. Replaces raw messages such
 * as "fetch failed" or "Invalid login credentials". Unknown errors get a generic message; the
 * caller logs the original.
 */
export function authErrorMessage(
  error: unknown,
  flow: AuthFlow,
  dev = process.env.NODE_ENV === "development",
): string {
  if (
    isAuthRetryableFetchError(error) ||
    (isAuthError(error) && (error.status ?? 0) >= 500)
  ) {
    return dev ? UNREACHABLE_DEV : UNREACHABLE;
  }
  const code = isAuthError(error) ? error.code : undefined;
  switch (code) {
    case "invalid_credentials":
      return "That email and password don't match. Check them, or email yourself a sign-in link.";
    case "email_not_confirmed":
      return "Confirm your email first: open the link we sent when you signed up.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Sign in instead.";
    case "weak_password":
      return "Choose a stronger password: at least 8 characters, harder to guess.";
    case "email_address_invalid":
      return "Enter a valid email address.";
    case "over_email_send_rate_limit":
      return "Too many emails sent to this address. Wait a minute, then try again.";
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute, then try again.";
    // signInWithOtp with shouldCreateUser: false and an unknown email.
    case "otp_disabled":
    case "user_not_found":
      return flow === "magic-link"
        ? "There's no account with this email. Check the spelling, or sign up first."
        : "There's no account with this email. Sign up first.";
    case "signup_disabled":
      return "New sign-ups are turned off.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}
