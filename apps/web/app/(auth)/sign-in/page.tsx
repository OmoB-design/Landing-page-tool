import type { Metadata } from "next";
import Link from "next/link";

import { SignInForm } from "@/components/features/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <SignInForm />
      <p>
        No account yet?{" "}
        <Link href="/sign-up" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
