// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationsButton } from "@/components/app/notifications-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useMarkNotificationsRead,
  useNotifications,
} from "@/lib/queries/notifications";

vi.mock("@/lib/queries/notifications", () => ({
  useNotifications: vi.fn(),
  useMarkNotificationsRead: vi.fn(() => ({ mutate: vi.fn() })),
}));

function renderBell(unread: number) {
  vi.mocked(useNotifications).mockReturnValue({
    data: { notifications: [], unread },
  } as unknown as ReturnType<typeof useNotifications>);
  vi.mocked(useMarkNotificationsRead).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useMarkNotificationsRead>);
  return render(
    <TooltipProvider>
      <NotificationsButton />
    </TooltipProvider>,
  );
}

describe("NotificationsButton", () => {
  it("announces unread notifications", () => {
    renderBell(3);
    expect(
      screen.getByRole("button", { name: "Notifications, 3 unread" }),
    ).toBeTruthy();
  });

  it("is a plain bell when everything is read", () => {
    renderBell(0);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });
});
