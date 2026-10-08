import { z } from "zod";

// NEXT_PUBLIC_* values are inlined at build time, so each one is read by its literal name.
const publicEnvSchema = z.object({
  supabaseUrl: z.url(),
  supabasePublishableKey: z.string().min(1),
  appUrl: z.url(),
});

export const publicEnv = publicEnvSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
});
