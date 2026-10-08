import type { Metadata } from "next";
import Link from "next/link";

import { AuthFrame, authLinkClass } from "@/components/app/auth-frame";
import { SignUpForm } from "@/components/features/auth/sign-up-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <AuthFrame
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className={authLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthFrame>
  );
}
