import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Link not valid" };

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Link not valid</h1>
      <p>
        This sign-in link is invalid or has expired. Request a new one from the
        sign-in page.
      </p>
      <Link href="/sign-in" className="underline">
        Back to sign in
      </Link>
    </main>
  );
}
