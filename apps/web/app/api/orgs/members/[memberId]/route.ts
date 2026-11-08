import { changeMemberRole, removeMember } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { membersAnswer } from "@/lib/members/answer";
import { roleChangeSchema } from "@/lib/validators/members";

/**
 * /api/orgs/members/[memberId] (B6.1): PATCH changes someone's role; DELETE removes them, or
 * lets you leave (your own id; the answer is then null).
 */
export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/orgs/members/[memberId]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { memberId } = await params;
  const parsed = roleChangeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return badRequest("Invalid request.");
  return membersAnswer(request, () =>
    changeMemberRole(
      session.accessToken,
      session.orgId,
      memberId,
      parsed.data.role,
    ),
  );
}

export async function DELETE(
  request: Request,
  { params }: RouteContext<"/api/orgs/members/[memberId]">,
) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const { memberId } = await params;
  return membersAnswer(request, () =>
    removeMember(session.accessToken, session.orgId, memberId),
  );
}
