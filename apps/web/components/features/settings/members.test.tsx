// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/app/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MembersAnswer } from "@/lib/validators/members";

import { MembersSettings } from "./members";

vi.mock("@/components/app/toaster", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const ADA = {
  user_id: "u-ada",
  name: "Ada",
  email: "ada@lume.test",
  role: "owner" as const,
  joined_at: "2026-10-07T10:00:00Z",
  you: true,
};
const SAM = {
  user_id: "u-sam",
  name: "Sam",
  email: "sam@lume.test",
  role: "member" as const,
  joined_at: "2026-11-07T10:00:00Z",
  you: false,
};
const INVITE = {
  id: "i-1",
  email: "kim@lume.test",
  role: "admin" as const,
  invited_by: "Ada",
  created_at: "2026-11-07T10:00:00Z",
  expires_at: "2026-11-14T10:00:00Z",
  expired: false,
  token: "t".repeat(46),
  url: `http://localhost:3000/invite/${"t".repeat(46)}`,
};
const OWNER_VIEW: MembersAnswer = {
  your_role: "owner",
  members: [ADA, SAM],
  invites: [INVITE],
};

function renderMembers(initial: MembersAnswer) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <MembersSettings initial={initial} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(toast.success).mockClear();
});

describe("Settings → Members (B6.1)", () => {
  it("invites by email and copies the new link", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const fresh = {
      ...INVITE,
      id: "i-2",
      email: "lee@lume.test",
      role: "member" as const,
      url: "http://localhost:3000/invite/new",
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ...OWNER_VIEW, invites: [fresh, INVITE] }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderMembers(OWNER_VIEW);

    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "not an email" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: " Lee@Lume.test " } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/invite/new",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orgs/members",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "lee@lume.test", role: "member" }),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Invite link copied",
      expect.anything(),
    );
    expect(await screen.findByText("lee@lume.test")).toBeTruthy();
  });

  it("lists members and open invites for an owner, who can't leave alone", () => {
    renderMembers(OWNER_VIEW);
    expect(screen.getByText("In this workspace · 2")).toBeTruthy();
    expect(screen.getByText("Invites · 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(screen.getByLabelText("Sam’s role")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
    // The only owner: no changing their own role, and Leave waits for another owner.
    expect(screen.queryByLabelText("Ada’s role")).toBeNull();
    const leave = screen.getByRole("button", { name: "Leave" });
    expect((leave as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a member the list only, with Leave for themselves", () => {
    renderMembers({
      your_role: "member",
      members: [
        { ...ADA, you: false },
        { ...SAM, you: true },
      ],
      invites: [],
    });
    expect(screen.queryByRole("form", { name: "Invite someone" })).toBeNull();
    expect(screen.queryByText(/Invites ·/)).toBeNull();
    expect(screen.queryByLabelText(/’s role/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(screen.getByText("Leave this workspace?")).toBeTruthy();
  });

  it("lets an admin manage members but not owners", () => {
    renderMembers({
      your_role: "admin",
      members: [
        { ...ADA, you: false },
        { ...SAM, role: "admin", you: true },
        { ...SAM, user_id: "u-jo", name: "Jo", email: "jo@lume.test" },
      ],
      invites: [],
    });
    expect(screen.queryByLabelText("Ada’s role")).toBeNull();
    expect(screen.getByLabelText("Jo’s role")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
  });
});
