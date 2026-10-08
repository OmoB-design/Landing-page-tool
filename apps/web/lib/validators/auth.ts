import { z } from "zod";

const email = z.email({ error: "Enter a valid email address." });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password." }),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, { error: "Enter your name." }).max(80),
  email,
  // Matches minimum_password_length in supabase/config.toml.
  password: z.string().min(8, { error: "Use at least 8 characters." }),
});

export const magicLinkSchema = z.object({ email });
