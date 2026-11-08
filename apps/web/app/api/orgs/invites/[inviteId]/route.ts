import { revokeInvite } from "@/lib/api/worker";
import { getApiSession, unauthorized } from "@/lib/auth/api-session";
import { membersAnswer } from "@/lib/members/answer";

/** DELETE /api/orgs/invites/[inviteId] (B6.1): turns an open invite off; its link stops working. */
export async function DELETE(
  request: Request,
  { params }: RouteContext<"/api/orgs/invites/[inviteId]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { inviteId } = await params;
  return membersAnswer(request, () =>
    revokeInvite(session.accessToken, session.orgId, inviteId),
  );
}
