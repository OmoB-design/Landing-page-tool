import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "@/components/features/auth/sign-up-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <SignUpForm />
      <p>
        Already have an account?{" "}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
