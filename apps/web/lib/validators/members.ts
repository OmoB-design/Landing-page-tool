import { z } from "zod";

/** Members and invites (B6.1, D129): worker /orgs/{id}/members, /orgs/{id}/invites, /invites. */

export const roleSchema = z.enum(["owner", "admin", "member"]);
export type Role = z.infer<typeof roleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/** What each role may do (BUILD_SPEC §3), as the Members page explains it. */
export const ROLE_HINTS: Record<Role, string> = {
  owner:
    "Everything, including making owners and the workspace’s testing switch.",
  admin: "Everything, plus members, invites and connections.",
  member: "Brands, products, templates and pages, and publishing.",
};

export const memberSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  joined_at: z.string(),
  you: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;

export const inviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: roleSchema,
  invited_by: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  expired: z.boolean(),
  token: z.string(),
});

export const membersStateSchema = z.object({
  your_role: roleSchema,
  members: z.array(memberSchema),
  invites: z.array(inviteSchema),
});
export type MembersState = z.infer<typeof membersStateSchema>;

/** The website's answer: each invite with its link on the production domain. */
export const membersAnswerSchema = membersStateSchema.extend({
  invites: z.array(inviteSchema.extend({ url: z.string() })),
});
export type MembersAnswer = z.infer<typeof membersAnswerSchema>;
export type InviteWithLink = MembersAnswer["invites"][number];

export const inviteFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter an email address, e.g. sam@yourbrand.com")),
  role: roleSchema,
});
export type InviteForm = z.input<typeof inviteFormSchema>;

export const roleChangeSchema = z.object({ role: roleSchema });

export const inviteInfoSchema = z.object({
  status: z.enum(["open", "expired", "revoked", "accepted"]),
  invite_id: z.string(),
  workspace: z.string(),
  email: z.string(),
  role: roleSchema,
  invited_by: z.string().nullable(),
});
export type InviteInfo = z.infer<typeof inviteInfoSchema>;

export const acceptedSchema = z.object({
  org_id: z.string(),
  workspace: z.string(),
  already_member: z.boolean(),
});
