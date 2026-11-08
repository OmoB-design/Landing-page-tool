import { z } from "zod";

/** Settings → Account (B6.2, D130): your name and your password. */

export const displayNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter your name." })
    .max(80, { error: "Keep it under 80 characters." }),
});

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, { error: "Enter your current password." }),
    // Matches minimum_password_length in supabase/config.toml and sign-up.
    next: z.string().min(8, { error: "Use at least 8 characters." }),
    confirm: z.string().min(1, { error: "Type the new password again." }),
  })
  .refine((values) => values.confirm === values.next, {
    path: ["confirm"],
    error: "The passwords don’t match.",
  })
  .refine((values) => values.next !== values.current, {
    path: ["next"],
    error: "Choose a password you haven’t been using.",
  });
export type PasswordChange = z.infer<typeof passwordChangeSchema>;

/** What the account actions answer: done, or what to show and where. */
export type AccountResult =
  | { ok: true }
  | { ok: false; error: string; field?: "name" | "current" | "next" };

/** A profile photo saved or removed (B6.7): its new address, or null once removed. */
export type AvatarResult =
  { ok: true; url: string | null } | { ok: false; error: string };
