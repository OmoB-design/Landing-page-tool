import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthFrame, authLinkClass } from "@/components/app/auth-frame";
import { SignInForm } from "@/components/features/auth/sign-in-form";
import { safeNext } from "@/lib/auth/next";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
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
      <Suspense fallback={<SignInForm />}>
        <SignInWithNext searchParams={searchParams} />
      </Suspense>
    </AuthFrame>
  );
}

/** Coming from an invite (`?next=/invite/…`, B6.1): back there once signed in. */
async function SignInWithNext({
  searchParams,
}: {
  searchParams: PageProps<"/sign-in">["searchParams"];
}) {
  const raw = (await searchParams).next;
  const next = safeNext(typeof raw === "string" ? raw : null);
  return <SignInForm next={next === "/home" ? undefined : next} />;
}
