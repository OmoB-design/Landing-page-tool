import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AuthFrame, authLinkClass } from "@/components/app/auth-frame";
import {
  InviteSignUpForm,
  JoinForm,
  SwitchAccountForm,
} from "@/components/features/auth/invite-forms";
import { Spinner } from "@/components/ui/spinner";
import { WorkerError, getInviteInfo } from "@/lib/api/worker";
import { createClient } from "@/lib/supabase/server";
import type { InviteInfo, Role } from "@/lib/validators/members";

export const metadata: Metadata = {
  title: "Join a workspace",
  robots: { index: false, follow: false },
};

const A_ROLE: Record<Role, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
};

const GONE: Record<Exclude<InviteInfo["status"], "open">, string> = {
  accepted: "This invite has already been used.",
  revoked: "This invite was turned off. Ask whoever invited you for a new one.",
  expired: "This invite has expired. Ask whoever invited you for a new one.",
};

/**
 * An invite to a workspace (B6.1, D129), opened from its link: no sign-in needed. Someone new
 * creates an account and joins; someone signed in with the invited email joins with one button;
 * signed in as someone else, they can sign out and come back.
 */
export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <Suspense
      fallback={
        <AuthFrame title="Opening the invite…">
          <Spinner className="mx-auto size-5" label="Opening the invite" />
        </AuthFrame>
      }
    >
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({
  params,
}: {
  params: PageProps<"/invite/[token]">["params"];
}) {
  await connection();
  const { token } = await params;
  let info: InviteInfo | null;
  try {
    info = await getInviteInfo(token);
  } catch (error) {
    return (
      <AuthFrame
        title="Couldn’t open the invite"
        description={
          error instanceof WorkerError
            ? error.message
            : "Something went wrong. Try again in a moment."
        }
      >
        {null}
      </AuthFrame>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedInAs = data?.claims.email?.toLowerCase() ?? null;

  if (!info || info.status !== "open") {
    const inIt = info?.status === "accepted" && signedInAs === info.email;
    return (
      <AuthFrame
        title={
          inIt ? `You’re in ${info?.workspace}` : "This invite isn’t available"
        }
        description={
          inIt
            ? "You joined with this invite."
            : info
              ? GONE[info.status as Exclude<InviteInfo["status"], "open">]
              : "The link isn’t complete, or it isn’t an invite. Check it, or ask for a new one."
        }
        footer={
          <Link
            href={signedInAs ? "/home" : "/sign-in"}
            className={authLinkClass}
          >
            {signedInAs ? "Open LP" : "Sign in"}
          </Link>
        }
      >
        {null}
      </AuthFrame>
    );
  }

  const title = `Join ${info.workspace}`;
  const description = `${info.invited_by ?? "Someone"} invited you to join as ${A_ROLE[info.role]}.`;

  if (signedInAs === info.email)
    return (
      <AuthFrame title={title} description={description}>
        <JoinForm token={token} workspace={info.workspace} />
      </AuthFrame>
    );

  if (signedInAs)
    return (
      <AuthFrame title={title} description={description}>
        <div className="flex flex-col gap-4">
          <p className="text-type-body-small text-sub-text">
            This invite is for{" "}
            <span className="font-medium text-heading-01">{info.email}</span>.
            You’re signed in as{" "}
            <span className="font-medium text-heading-01">{signedInAs}</span>.
          </p>
          <SwitchAccountForm token={token} />
        </div>
      </AuthFrame>
    );

  return (
    <AuthFrame
      title={title}
      description={description}
      footer={
        <>
          Already have an account with this email?{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}
            className={authLinkClass}
          >
            Sign in
          </Link>
        </>
      }
    >
      <InviteSignUpForm token={token} email={info.email} />
    </AuthFrame>
  );
}
