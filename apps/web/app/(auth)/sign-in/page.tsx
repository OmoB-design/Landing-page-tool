import type { Metadata } from "next";
import Link from "next/link";

import { AuthFrame, authLinkClass } from "@/components/app/auth-frame";
import { SignInForm } from "@/components/features/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthFrame
      title="Sign in"
      description="Welcome back."
      footer={
        <>
          No account yet?{" "}
          <Link href="/sign-up" className={authLinkClass}>
            Sign up
          </Link>
        </>
      }
    >
      <SignInForm />
    </AuthFrame>
  );
}
