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

/** Opens a row's ⋯ menu. */
function openMenu(label: string) {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: `Actions for ${label}` }),
    {
      button: 0,
      ctrlKey: false,
    },
  );
  return screen.getByRole("menu");
}

describe("Settings → Members (B6.1, B6.3)", () => {
  it("invites by email in a modal and copies the new link", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "not an email" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: " Lee@Lume.test " } });
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
    expect(await screen.findByText("Invite ready")).toBeTruthy();
    expect(screen.getByLabelText("Invite link")).toHaveProperty(
      "value",
      "http://localhost:3000/invite/new",
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("lee@lume.test")).toBeTruthy();
  });

  it("lists people and open invites in one table for an owner, who can't leave alone", () => {
    renderMembers(OWNER_VIEW);
    const rows = screen.getAllByRole("row");
    // The header, Ada, Sam and Kim's invite.
    expect(rows).toHaveLength(4);
    expect(screen.getByText("kim@lume.test")).toBeTruthy();
    expect(screen.getByText("Invited")).toBeTruthy();

    let menu = openMenu("Sam");
    expect(menu.textContent).toContain("Owner");
    expect(
      screen.getByRole("menuitemradio", { name: "Member" }),
    ).toHaveProperty("ariaChecked", "true");
    expect(
      screen.getByRole("menuitem", { name: "Remove from workspace" }),
    ).toBeTruthy();
    fireEvent.keyDown(menu, { key: "Escape" });

    // The only owner: no changing their own role, and Leave waits for another owner.
    menu = openMenu("Ada");
    expect(screen.queryByRole("menuitemradio")).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Leave workspace" }),
    ).toHaveProperty("ariaDisabled", "true");
    expect(menu.textContent).toContain("Make someone else an owner first.");
    fireEvent.keyDown(menu, { key: "Escape" });

    openMenu("the invite for kim@lume.test");
    expect(screen.getByRole("menuitem", { name: "Copy link" })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Revoke invite" }),
    ).toBeTruthy();
  });

  it("searches and filters the table", () => {
    Element.prototype.scrollIntoView ??= () => {};
    renderMembers(OWNER_VIEW);
    fireEvent.change(screen.getByLabelText("Search members"), {
      target: { value: "SAM" },
    });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Sam")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search members"), {
      target: { value: "nobody" },
    });
    expect(screen.getByText("No one matches “nobody”")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search members"), {
      target: { value: "" },
    });
    fireEvent.keyDown(screen.getByLabelText("Show"), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Invites" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("kim@lume.test")).toBeTruthy();
  });

  it("shows a member the table only, with Leave for themselves", () => {
    renderMembers({
      your_role: "member",
      members: [
        { ...ADA, you: false },
        { ...SAM, you: true },
      ],
      invites: [INVITE],
    });
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    expect(screen.queryByText("kim@lume.test")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Actions for Ada" }),
    ).toBeNull();
    openMenu("Sam");
    expect(screen.queryByRole("menuitemradio")).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Leave workspace" }));
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
    expect(
      screen.queryByRole("button", { name: "Actions for Ada" }),
    ).toBeNull();
    openMenu("Jo");
    // Admins never give Owner.
    expect(screen.queryByRole("menuitemradio", { name: "Owner" })).toBeNull();
    expect(screen.getByRole("menuitemradio", { name: "Admin" })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Remove from workspace" }),
    ).toBeTruthy();
  });
});
