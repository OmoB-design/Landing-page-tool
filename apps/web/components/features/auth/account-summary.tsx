import { redirect } from "next/navigation";
import { connection } from "next/server";

import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

/** Who is signed in and which orgs they belong to. Reads the session, so render inside Suspense. */
export async function AccountSummary() {
  // Request-time only: the Supabase client checks token expiry against the clock, which
  // Cache Components does not allow during prerendering.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/sign-in");

  const { data: memberships, error } = await supabase
    .from("org_members")
    .select("org_id, role, orgs(name)")
    .eq("user_id", claims.sub);
  if (error)
    throw new Error(`Could not load your organisations: ${error.message}`);

  return (
    <div className="flex flex-col gap-4">
      <p>
        Signed in as <strong>{claims.email}</strong>
      </p>
      <div className="flex flex-col gap-1">
        <p className="font-medium">Organisations</p>
        <ul className="list-disc pl-6">
          {memberships.map((membership) => (
            <li key={membership.org_id}>
              {membership.orgs?.name} ({membership.role})
            </li>
          ))}
        </ul>
      </div>
      <form action={signOut}>
        <button type="submit" className="rounded border px-3 py-2 font-medium">
          Sign out
        </button>
      </form>
    </div>
  );
}
