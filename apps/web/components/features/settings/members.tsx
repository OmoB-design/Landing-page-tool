"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { type FormEvent, useDeferredValue, useId, useState } from "react";

import { PersonMark } from "@/components/app/mark";
import { SkeletonMark, SkeletonText } from "@/components/app/skeletons";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckIcon, CopyIcon, SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { RowMoreIcon } from "@/components/ui/lp-icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api/client";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
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

import { SettingsPage } from "./settings-page";

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

type Filter = "all" | Role | "invited";
const FILTERS: { value: Filter; label: string; managers?: boolean }[] = [
  { value: "all", label: "Everyone" },
  { value: "owner", label: "Owners" },
  { value: "admin", label: "Admins" },
  { value: "member", label: "Members" },
  { value: "invited", label: "Invites", managers: true },
];

type Entry =
  | { kind: "member"; key: string; member: Member }
  | { kind: "invite"; key: string; invite: InviteWithLink };

/** The roles someone with `you` may give: owners give any, admins never Owner. */
const choosable = (you: Role) =>
  ROLES.filter((role) => you === "owner" || role !== "owner");

/** Someone with `you` may change or remove `target` (admins can't touch owners). */
const canTouch = (you: Role, target: Role) =>
  MANAGERS.includes(you) && (you === "owner" || target !== "owner");

/** The rows a filter and a search leave: name or email for people, email for invites. */
function visible(entries: Entry[], filter: Filter, search: string) {
  const q = search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filter === "invited" && entry.kind !== "invite") return false;
    if (filter !== "all" && filter !== "invited") {
      if (entry.kind !== "member" || entry.member.role !== filter) return false;
    }
    if (!q) return true;
    return entry.kind === "member"
      ? entry.member.name.toLowerCase().includes(q) ||
          entry.member.email.toLowerCase().includes(q)
      : entry.invite.email.toLowerCase().includes(q);
  });
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

const MENU =
  "flex min-w-40 flex-col gap-0.5 rounded-sm bg-surface-modal p-0.5 shadow-float edge-hairline";
const ITEM =
  "rounded-xsm px-1 py-0.5 text-type-caption-1 font-medium text-heading-02 focus:bg-foreground-03 focus:text-heading-02";
const DANGER =
  "rounded-xsm px-1 py-0.5 text-type-caption-1 font-medium text-text-danger focus:bg-foreground-03 focus:text-text-danger";

/**
 * Settings → Members (B6.1, D129; laid out as Quality's Members in the 544 px settings column,
 * B6.3, D131): a toolbar (Search, a filter, Invite for owners and admins), then one table of the
 * people and the open invites (Name and email, Role, Status), each row's actions in its ⋯ menu.
 * Owners and admins change roles and remove people (admins not owners, and the last owner stays);
 * anyone can leave. Invite opens a modal that makes the link to send.
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const query = useDeferredValue(search);

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
  const revoke = useMutation({
    mutationFn: (invite: InviteWithLink) =>
      apiFetch(`/api/orgs/invites/${invite.id}`, membersAnswerSchema, {
        method: "DELETE",
      }),
    onSuccess: (next, invite) => {
      save(next);
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
      save(next);
      const made = next.invites.find((i) => i.email === invite.email);
      if (made) void copyLink(made, true);
    },
    onError: (error) => toast.error(error.message),
  });

  // Invites are for owners and admins to see (the worker sends them to everyone in the workspace).
  const entries: Entry[] = [
    ...data.members.map((member): Entry => ({
      kind: "member",
      key: member.user_id,
      member,
    })),
    ...(manager ? data.invites : []).map((invite): Entry => ({
      kind: "invite",
      key: invite.id,
      invite,
    })),
  ];
  const rows = visible(entries, filter, query);
  const empty = query.trim()
    ? `No one matches “${query.trim()}”`
    : filter === "invited"
      ? "No open invites"
      : "No one with this role";

  return (
    <SettingsPage title={TITLE} description={DESCRIPTION}>
      <div className="flex flex-col gap-4">
        <Toolbar
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
          manager={manager}
          onInvite={() => setInviting(true)}
        />
        <Table className="min-w-120">
          <TableCaption className="sr-only">
            People in this workspace and open invites
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col" className="w-24">
                Role
              </TableHead>
              <TableHead scope="col" className="w-24">
                Status
              </TableHead>
              <TableHead scope="col" className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-12 text-center text-heading-05"
                >
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((entry) =>
                entry.kind === "member" ? (
                  <MemberRow
                    key={entry.key}
                    member={entry.member}
                    you={you}
                    lastOwner={entry.member.role === "owner" && owners <= 1}
                    busy={
                      (role.isPending &&
                        role.variables.member.user_id ===
                          entry.member.user_id) ||
                      (remove.isPending &&
                        remove.variables.user_id === entry.member.user_id)
                    }
                    onRole={(next) =>
                      role.mutate({ member: entry.member, next })
                    }
                    onRemove={() => setRemoving(entry.member)}
                  />
                ) : (
                  <InviteRow
                    key={entry.key}
                    invite={entry.invite}
                    you={you}
                    busy={
                      (revoke.isPending &&
                        revoke.variables.id === entry.invite.id) ||
                      (again.isPending &&
                        again.variables.id === entry.invite.id)
                    }
                    onCopy={() => void copyLink(entry.invite)}
                    onAgain={() => again.mutate(entry.invite)}
                    onRevoke={() => revoke.mutate(entry.invite)}
                  />
                ),
              )
            )}
          </TableBody>
        </Table>
      </div>

      {manager ? (
        <InviteDialog
          open={inviting}
          onOpenChange={setInviting}
          you={you}
          onInvited={save}
        />
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

/** Search and the filter on the left; Invite on the right for owners and admins (Quality's). */
function Toolbar({
  search,
  onSearch,
  filter,
  onFilter,
  manager,
  onInvite,
  inert = false,
}: {
  search: string;
  onSearch: (next: string) => void;
  filter: Filter;
  onFilter: (next: Filter) => void;
  manager: boolean;
  onInvite: () => void;
  inert?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2"
      inert={inert || undefined}
      aria-hidden={inert || undefined}
    >
      <div className="relative min-w-0 flex-1 sm:max-w-56 sm:flex-none sm:basis-56">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-icon-system"
        />
        <Input
          type="search"
          aria-label="Search members"
          placeholder="Search"
          autoComplete="off"
          spellCheck={false}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className="h-7 rounded-sm pr-2 pl-7"
        />
      </div>
      <Select value={filter} onValueChange={(next) => onFilter(next as Filter)}>
        <SelectTrigger size="sm" aria-label="Show" className="w-28">
          {/* Named here so it shows before the page's scripts run. */}
          <SelectValue>
            {FILTERS.find((option) => option.value === filter)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent variant="menu" className="min-w-36">
          {FILTERS.filter((option) => manager || !option.managers).map(
            (option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                variant="menu"
              >
                {option.label}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
      {manager ? (
        <Button size="sm" className="ml-auto shrink-0" onClick={onInvite}>
          Invite
        </Button>
      ) : null}
    </div>
  );
}

/** The ⋯ at the end of a row, as on the Pages list: shown on row hover, keyboard focus or touch. */
function RowMenuButton({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={`Actions for ${label}`}
        className="inline-flex size-4.5 items-center justify-center rounded-xsm bg-foreground-03 text-body opacity-0 outline-none group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:opacity-100 data-open:opacity-100"
      >
        <RowMoreIcon />
      </button>
    </DropdownMenuTrigger>
  );
}

/** A row's status, with its date on hover (and for screen readers). */
function Status({
  label,
  when,
  danger = false,
}: {
  label: string;
  when: string | null;
  danger?: boolean;
}) {
  const text = (
    <span className={danger ? "text-text-danger" : "text-heading-05"}>
      {label}
      {when ? <span className="sr-only">{`, ${when}`}</span> : null}
    </span>
  );
  if (!when) return text;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{text}</TooltipTrigger>
      <TooltipContent>{when}</TooltipContent>
    </Tooltip>
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
  const joined = hydrated
    ? `Joined ${format(new Date(member.joined_at), "d MMM yyyy")}`
    : null;
  return (
    <TableRow className="group/row h-12">
      <TableCell>
        <div className="flex min-w-0 items-center gap-2.5">
          <PersonMark
            name={member.name}
            className="size-6 font-sans text-type-caption-1"
          />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {member.name}
              {member.you ? (
                <span className="font-normal text-heading-05"> (you)</span>
              ) : null}
            </p>
            <p className="truncate text-type-caption-1 text-heading-05">
              {member.email}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-heading-04">
        {ROLE_LABELS[member.role]}
      </TableCell>
      <TableCell>
        <Status label="Active" when={joined} />
      </TableCell>
      <TableCell className="pr-3 text-right">
        {busy ? (
          <Spinner className="size-3.5" label="Saving" />
        ) : editable || removable ? (
          <DropdownMenu>
            <RowMenuButton label={member.name} />
            <DropdownMenuContent align="end" sideOffset={5} className={MENU}>
              {editable ? (
                <>
                  <DropdownMenuLabel className="px-1 pt-1 pb-0.5 text-type-caption-2 font-medium text-heading-05">
                    Role
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={member.role}
                    onValueChange={(next) => {
                      if (next !== member.role) onRole(next as Role);
                    }}
                  >
                    {choosable(you).map((r) => (
                      <DropdownMenuRadioItem
                        key={r}
                        value={r}
                        checkClassName="size-3.5 text-icon-system"
                        className={cn(ITEM, "pr-6")}
                      >
                        {ROLE_LABELS[r]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {removable ? (
                    <DropdownMenuSeparator className="my-0.5" />
                  ) : null}
                </>
              ) : null}
              {removable ? (
                member.you && lastOwner ? (
                  <>
                    <DropdownMenuItem disabled className={ITEM}>
                      Leave workspace
                    </DropdownMenuItem>
                    <p className="px-1 pb-1 text-type-caption-2 text-heading-05">
                      Make someone else an owner first.
                    </p>
                  </>
                ) : (
                  <DropdownMenuItem className={DANGER} onSelect={onRemove}>
                    {member.you ? "Leave workspace" : "Remove from workspace"}
                  </DropdownMenuItem>
                )
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function InviteRow({
  invite,
  you,
  busy,
  onCopy,
  onAgain,
  onRevoke,
}: {
  invite: InviteWithLink;
  you: Role;
  busy: boolean;
  onCopy: () => void;
  onAgain: () => void;
  onRevoke: () => void;
}) {
  const hydrated = useHydrated();
  // Admins can't touch an invite to be an owner.
  const locked = invite.role === "owner" && you !== "owner";
  const until = hydrated ? format(new Date(invite.expires_at), "d MMM") : null;
  const when = until
    ? invite.expired
      ? `Ended ${until}`
      : `The link works until ${until}`
    : null;
  return (
    <TableRow className="group/row h-12">
      <TableCell>
        <div className="flex min-w-0 items-center gap-2.5">
          <PersonMark
            name={invite.email}
            className="size-6 font-sans text-type-caption-1 opacity-40"
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{invite.email}</p>
            <p className="truncate text-type-caption-1 text-heading-05">
              {invite.invited_by
                ? `Invited by ${invite.invited_by}`
                : "Invited"}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-heading-04">
        {ROLE_LABELS[invite.role]}
      </TableCell>
      <TableCell>
        <Status
          label={invite.expired ? "Expired" : "Invited"}
          when={when}
          danger={invite.expired}
        />
      </TableCell>
      <TableCell className="pr-3 text-right">
        {busy ? (
          <Spinner className="size-3.5" label="Saving" />
        ) : (
          <DropdownMenu>
            <RowMenuButton label={`the invite for ${invite.email}`} />
            <DropdownMenuContent align="end" sideOffset={5} className={MENU}>
              {invite.expired ? (
                <DropdownMenuItem
                  className={ITEM}
                  disabled={locked}
                  onSelect={onAgain}
                >
                  Invite again
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className={ITEM} onSelect={onCopy}>
                  Copy link
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator className="my-0.5" />
              <DropdownMenuItem
                className={DANGER}
                disabled={locked}
                onSelect={onRevoke}
              >
                Revoke invite
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Invite someone (Quality's Invite members, as LP's modals are drawn): an email and a role, then
 * the link to send them, copied as it's made, with Copy in case that didn't take.
 */
function InviteDialog({
  open,
  onOpenChange,
  you,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  you: Role;
  onInvited: (next: MembersAnswer) => void;
}) {
  const ids = { email: useId(), role: useId() };
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<InviteWithLink | null>(null);
  const [copied, setCopied] = useState(false);
  const copy = async (invite: InviteWithLink) => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const invite = useMutation({
    mutationFn: (values: { email: string; role: Role }) =>
      apiFetch("/api/orgs/members", membersAnswerSchema, {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (next, values) => {
      onInvited(next);
      const found = next.invites.find((i) => i.email === values.email);
      if (found) {
        setMade(found);
        void copy(found);
      }
    },
    onError: (failure) => setError(failure.message),
  });
  const reset = () => {
    setEmail("");
    setRole("member");
    setError(null);
    setMade(null);
    setCopied(false);
    invite.reset();
  };
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && invite.isPending) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        {made ? (
          <div className="flex flex-col">
            <div className="flex flex-col gap-6 px-6 pt-6 pb-6">
              <div className="flex flex-col gap-1">
                <DialogTitle className="text-type-body-small font-medium text-heading-01">
                  Invite ready
                </DialogTitle>
                <DialogDescription className="text-type-caption-1 text-heading-05">
                  {`Send this link to ${made.email}. It works for 7 days.`}
                </DialogDescription>
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label="Invite link"
                  value={made.url}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-8 min-w-0 flex-1 px-2.5 font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={() => void copy(made)}
                >
                  {copied ? (
                    <CheckIcon aria-hidden className="size-3.5" />
                  ) : (
                    <CopyIcon aria-hidden className="size-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 divider-t-half">
              <Button
                type="button"
                variant="outline"
                size="compact"
                onClick={reset}
              >
                Invite someone else
              </Button>
              <Button
                type="button"
                size="compact"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={submit}
            noValidate
            aria-label="Invite someone"
            className="flex flex-col"
          >
            <div className="flex flex-col gap-6 px-6 pt-6 pb-6">
              <div className="flex flex-col gap-1">
                <DialogTitle className="text-type-body-small font-medium text-heading-01">
                  Invite someone
                </DialogTitle>
                <DialogDescription className="text-type-caption-1 text-heading-05">
                  You get a link to send them. It works for 7 days.
                </DialogDescription>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={ids.email}
                  className="text-type-caption-1 font-medium text-heading-02"
                >
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
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError(null);
                  }}
                  className="h-8 px-2.5"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={ids.role}
                  className="text-type-caption-1 font-medium text-heading-02"
                >
                  Role
                </label>
                <Select
                  value={role}
                  onValueChange={(next) => setRole(next as Role)}
                >
                  <SelectTrigger
                    id={ids.role}
                    className="h-8 w-full text-heading-02"
                  >
                    <SelectValue>{ROLE_LABELS[role]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent variant="menu">
                    {choosable(you).map((r) => (
                      <SelectItem key={r} value={r} variant="menu">
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-type-caption-2 text-heading-05">
                  {ROLE_HINTS[role]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-6 py-4 divider-t-half">
              {error ? (
                <p
                  role="alert"
                  className="min-w-0 flex-1 text-type-caption-1 font-medium text-text-danger"
                >
                  {error}
                </p>
              ) : (
                <span className="flex-1" />
              )}
              <Button
                type="button"
                variant="outline"
                size="compact"
                disabled={invite.isPending}
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="compact" disabled={invite.isPending}>
                {invite.isPending ? (
                  <Spinner className="size-3.5" label="Inviting" />
                ) : null}
                Create invite
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Members while it loads (D99): the toolbar and the table's header as themselves (drawn for an
 * owner or admin, the usual case), then three rows whose people are shapes.
 */
export function MembersSettingsSkeleton() {
  return (
    <SettingsPage title={TITLE} description={DESCRIPTION}>
      <div aria-hidden className="flex flex-col gap-4">
        <Toolbar
          search=""
          onSearch={() => {}}
          filter="all"
          onFilter={() => {}}
          manager
          onInvite={() => {}}
          inert
        />
        <Table className="min-w-120">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col" className="w-24">
                Role
              </TableHead>
              <TableHead scope="col" className="w-24">
                Status
              </TableHead>
              <TableHead scope="col" className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[120, 96, 140].map((width) => (
              <TableRow key={width} className="h-12">
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SkeletonMark size={24} round />
                    <div className="flex min-w-0 flex-col">
                      <SkeletonText
                        className="text-type-body-small"
                        width={width}
                      />
                      <SkeletonText
                        className="text-type-caption-1"
                        width={width + 48}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <SkeletonText className="text-type-body-small" width={44} />
                </TableCell>
                <TableCell>
                  <SkeletonText className="text-type-body-small" width={40} />
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SettingsPage>
  );
}
