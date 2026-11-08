"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

import { WorkspaceMark } from "@/components/app/mark";
import { SkeletonText } from "@/components/app/skeletons";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api/client";
import { useHydrated } from "@/lib/use-hydrated";
import {
  type InviteWithLink,
  type Member,
  type MembersAnswer,
  ROLE_HINTS,
  ROLE_LABELS,
  type Role,
  inviteFormSchema,
  membersAnswerSchema,
} from "@/lib/validators/members";

import { SettingsDivider, SettingsPage } from "./settings-page";

const KEY = ["members"] as const;
const ROLES: Role[] = ["owner", "admin", "member"];
const TITLE = "Members";
const DESCRIPTION = "Who’s in this workspace, and invites to join it.";
const MANAGERS: Role[] = ["owner", "admin"];
const A_ROLE: Record<Role, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
};

/** The roles someone with `you` may give: owners give any, admins never Owner. */
const choosable = (you: Role) =>
  ROLES.filter((role) => you === "owner" || role !== "owner");

/** Someone with `you` may change or remove `target` (admins can't touch owners). */
const canTouch = (you: Role, target: Role) =>
  MANAGERS.includes(you) && (you === "owner" || target !== "owner");

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-type-body-small font-medium text-heading-01">
      {children}
    </h2>
  );
}

async function copyLink(invite: InviteWithLink, made = false) {
  try {
    await navigator.clipboard.writeText(invite.url);
    toast.success(made ? "Invite link copied" : "Link copied", {
      description: `Send it to ${invite.email}. It works for 7 days.`,
    });
  } catch {
    toast.error("Couldn’t copy the link.", { description: invite.url });
  }
}

/**
 * Settings → Members (B6.1, D129; no Figma frame yet, built in the settings pages' style, D88):
 * owners and admins invite by email with a role and get a link to send; everyone sees who's in
 * the workspace; owners and admins change roles and remove people (admins not owners, and the
 * last owner stays); anyone can leave. Open invites list with Copy link and Revoke.
 */
export function MembersSettings({ initial }: { initial: MembersAnswer }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch("/api/orgs/members", membersAnswerSchema),
    initialData: initial,
    initialDataUpdatedAt: 0,
    staleTime: "static",
    // While invites are open, look again every 15 s (paused in a hidden tab), so someone joining
    // shows up and their invite leaves the list.
    refetchInterval: (query) =>
      query.state.data?.invites.some((invite) => !invite.expired)
        ? 15_000
        : false,
  });
  const save = (next: MembersAnswer | null) => {
    if (next) queryClient.setQueryData(KEY, next);
  };
  const you = data.your_role;
  const manager = MANAGERS.includes(you);
  const owners = data.members.filter((m) => m.role === "owner").length;
  const [removing, setRemoving] = useState<Member | null>(null);

  const role = useMutation({
    mutationFn: ({ member, next }: { member: Member; next: Role }) =>
      apiFetch(`/api/orgs/members/${member.user_id}`, membersAnswerSchema, {
        method: "PATCH",
        body: JSON.stringify({ role: next }),
      }),
    onSuccess: (next, { member, next: given }) => {
      save(next);
      toast.success(
        `${member.you ? "You’re" : `${member.name} is`} now ${A_ROLE[given]}`,
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (member: Member) =>
      apiFetch(
        `/api/orgs/members/${member.user_id}`,
        membersAnswerSchema.nullable(),
        { method: "DELETE" },
      ),
    onSuccess: (next, member) => {
      setRemoving(null);
      if (member.you) {
        // Left: the app opens another of their workspaces.
        router.push("/home");
        router.refresh();
        return;
      }
      save(next);
      toast.success(`${member.name} was removed from the workspace`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <SettingsPage title={TITLE} description={DESCRIPTION}>
      {manager ? (
        <>
          <InviteForm you={you} onInvited={save} />
          <SettingsDivider />
        </>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionTitle>{`In this workspace · ${data.members.length}`}</SectionTitle>
        <ul role="list" className="flex flex-col">
          {data.members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              you={you}
              lastOwner={member.role === "owner" && owners <= 1}
              busy={
                (role.isPending &&
                  role.variables.member.user_id === member.user_id) ||
                (remove.isPending &&
                  remove.variables.user_id === member.user_id)
              }
              onRole={(next) => role.mutate({ member, next })}
              onRemove={() => setRemoving(member)}
            />
          ))}
        </ul>
      </section>

      {manager && data.invites.length > 0 ? (
        <>
          <SettingsDivider />
          <Invites invites={data.invites} you={you} onChange={save} />
        </>
      ) : null}

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setRemoving(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {removing?.you
                ? "Leave this workspace?"
                : `Remove ${removing?.name ?? ""}?`}
            </DialogTitle>
            <DialogDescription>
              {removing?.you
                ? "You won’t see its brands, templates or pages any more. Someone can invite you back."
                : "They lose access to this workspace at once. Its brands, templates and pages stay. You can invite them again."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={remove.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => removing && remove.mutate(removing)}
            >
              {remove.isPending ? (
                <Spinner className="size-3.5" label="Removing" />
              ) : null}
              {removing?.you ? "Leave" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}

/** Invite: an email and a role; the link is copied as the invite is made. */
function InviteForm({
  you,
  onInvited,
}: {
  you: Role;
  onInvited: (next: MembersAnswer) => void;
}) {
  const ids = { email: useId(), role: useId(), error: useId() };
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: (values: { email: string; role: Role }) =>
      apiFetch("/api/orgs/members", membersAnswerSchema, {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (next, values) => {
      onInvited(next);
      setEmail("");
      const made = next.invites.find((i) => i.email === values.email);
      if (made) void copyLink(made, true);
    },
    onError: (failure) => setError(failure.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = inviteFormSchema.safeParse({ email, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the email.");
      return;
    }
    setError(null);
    invite.mutate(parsed.data);
  };
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Invite someone</SectionTitle>
      <form
        onSubmit={submit}
        noValidate
        aria-label="Invite someone"
        className="flex flex-col gap-2"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={ids.email} className="sr-only">
            Email
          </label>
          <Input
            id={ids.email}
            type="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="name@yourbrand.com"
            value={email}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.error : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            className="h-8 min-w-0 px-2.5 sm:flex-1"
          />
          <label htmlFor={ids.role} className="sr-only">
            Role
          </label>
          <Select value={role} onValueChange={(next) => setRole(next as Role)}>
            <SelectTrigger id={ids.role} className="h-8 sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choosable(you).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" disabled={invite.isPending}>
            {invite.isPending ? (
              <Spinner className="size-3.5" label="Inviting" />
            ) : null}
            Invite
          </Button>
        </div>
        {error ? (
          <p
            id={ids.error}
            role="alert"
            className="text-type-caption-1 text-destructive"
          >
            {error}
          </p>
        ) : (
          <p className="text-type-caption-1 text-heading-05">
            {ROLE_LABELS[role]}: {ROLE_HINTS[role]} You get a link to send them;
            it works for 7 days.
          </p>
        )}
      </form>
    </section>
  );
}

function MemberRow({
  member,
  you,
  lastOwner,
  busy,
  onRole,
  onRemove,
}: {
  member: Member;
  you: Role;
  lastOwner: boolean;
  busy: boolean;
  onRole: (next: Role) => void;
  onRemove: () => void;
}) {
  const hydrated = useHydrated();
  const editable = canTouch(you, member.role) && !(member.you && lastOwner);
  const removable = member.you || canTouch(you, member.role);
  const roleId = useId();
  return (
    <li className="flex items-center gap-3 py-2.5 not-last:divider-b-half">
      <WorkspaceMark
        name={member.name}
        className="size-7 rounded-full text-type-body-small"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-type-body-small font-medium text-heading-01">
          {member.name}
          {member.you ? (
            <span className="font-normal text-heading-05"> (you)</span>
          ) : null}
        </p>
        <p className="truncate text-type-caption-1 text-heading-05">
          {member.email}
          {hydrated
            ? ` · joined ${format(new Date(member.joined_at), "d MMM yyyy")}`
            : null}
        </p>
      </div>
      {busy ? <Spinner className="size-3.5" label="Saving" /> : null}
      {editable ? (
        <>
          <label htmlFor={roleId} className="sr-only">
            {`${member.name}’s role`}
          </label>
          <Select
            value={member.role}
            disabled={busy}
            onValueChange={(next) => onRole(next as Role)}
          >
            <SelectTrigger id={roleId} size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {choosable(you).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : (
        <span className="w-24 px-2.5 text-type-caption-1 text-heading-04">
          {ROLE_LABELS[member.role]}
        </span>
      )}
      {removable ? (
        member.you && lastOwner ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="rounded-sm">
                <Button variant="ghost" size="sm" disabled className="w-16">
                  Leave
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Make someone else an owner first</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onRemove}
            className="w-16"
          >
            {member.you ? "Leave" : "Remove"}
          </Button>
        )
      ) : (
        <span aria-hidden className="w-16" />
      )}
    </li>
  );
}

function Invites({
  invites,
  you,
  onChange,
}: {
  invites: InviteWithLink[];
  you: Role;
  onChange: (next: MembersAnswer) => void;
}) {
  const hydrated = useHydrated();
  const revoke = useMutation({
    mutationFn: (invite: InviteWithLink) =>
      apiFetch(`/api/orgs/invites/${invite.id}`, membersAnswerSchema, {
        method: "DELETE",
      }),
    onSuccess: (next, invite) => {
      onChange(next);
      toast.success(`Invite for ${invite.email} turned off`);
    },
    onError: (error) => toast.error(error.message),
  });
  const again = useMutation({
    mutationFn: (invite: InviteWithLink) =>
      apiFetch("/api/orgs/members", membersAnswerSchema, {
        method: "POST",
        body: JSON.stringify({ email: invite.email, role: invite.role }),
      }),
    onSuccess: (next, invite) => {
      onChange(next);
      const made = next.invites.find((i) => i.email === invite.email);
      if (made) void copyLink(made, true);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{`Invites · ${invites.length}`}</SectionTitle>
      <ul role="list" className="flex flex-col">
        {invites.map((invite) => {
          const locked = invite.role === "owner" && you !== "owner";
          const busy =
            (revoke.isPending && revoke.variables.id === invite.id) ||
            (again.isPending && again.variables.id === invite.id);
          return (
            <li
              key={invite.id}
              className="flex items-center gap-3 py-2.5 not-last:divider-b-half"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-type-body-small font-medium text-heading-01">
                  {invite.email}
                </p>
                <p className="truncate text-type-caption-1 text-heading-05">
                  {ROLE_LABELS[invite.role]}
                  {invite.invited_by
                    ? ` · invited by ${invite.invited_by}`
                    : ""}
                  {invite.expired ? (
                    <span className="text-destructive"> · expired</span>
                  ) : hydrated ? (
                    ` · until ${format(new Date(invite.expires_at), "d MMM")}`
                  ) : null}
                </p>
              </div>
              {busy ? <Spinner className="size-3.5" label="Saving" /> : null}
              {invite.expired ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || locked}
                  onClick={() => again.mutate(invite)}
                >
                  Invite again
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void copyLink(invite)}
                >
                  Copy link
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || locked}
                onClick={() => revoke.mutate(invite)}
              >
                Revoke
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Members while it loads: the title, the list's heading and three rows. */
export function MembersSettingsSkeleton() {
  return (
    <SettingsPage title={TITLE} description={DESCRIPTION}>
      <section aria-hidden className="flex flex-col gap-3">
        <SkeletonText className="text-type-body-small" width={140} />
        <ul role="list" className="flex flex-col">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex items-center gap-3 py-2.5 not-last:divider-b-half"
            >
              <Skeleton width={28} height={28} radius="var(--radius-max)" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <SkeletonText className="text-type-body-small" width={120} />
                <SkeletonText className="text-type-caption-1" width={180} />
              </div>
              <Skeleton width={96} height={28} />
            </li>
          ))}
        </ul>
      </section>
    </SettingsPage>
  );
}
