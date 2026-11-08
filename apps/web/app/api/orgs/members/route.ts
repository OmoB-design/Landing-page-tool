import { getMembers, inviteMember } from "@/lib/api/worker";
import {
  badRequest,
  getApiSession,
  unauthorized,
} from "@/lib/auth/api-session";
import { membersAnswer } from "@/lib/members/answer";
import { inviteFormSchema } from "@/lib/validators/members";

/**
 * /api/orgs/members (B6.1, D129): GET everyone in the current workspace (and, for owners and
 * admins, its open invites with their links); POST invites an email with a role.
 */
export async function GET(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  return membersAnswer(request, () =>
    getMembers(session.accessToken, session.orgId),
  );
}

export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  const parsed = inviteFormSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  return membersAnswer(request, () =>
    inviteMember(
      session.accessToken,
      session.orgId,
      parsed.data.email,
      parsed.data.role,
    ),
  );
}
