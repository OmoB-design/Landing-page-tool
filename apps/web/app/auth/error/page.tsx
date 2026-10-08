import type { Metadata } from "next";
import Link from "next/link";

import { AuthFrame, authLinkClass } from "@/components/app/auth-frame";

export const metadata: Metadata = { title: "Link not valid" };

export default function AuthErrorPage() {
  return (
    <AuthFrame
      title="Link not valid"
      description="This sign-in link is invalid or has expired. Request a new one from the sign-in page."
    >
      <Link href="/sign-in" className={authLinkClass}>
        Back to sign in
      </Link>
    </AuthFrame>
  );
}
