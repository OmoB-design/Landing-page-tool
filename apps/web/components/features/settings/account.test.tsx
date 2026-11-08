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

import { setThemePreference } from "@/components/app/theme-preference";
import { toast } from "@/components/app/toaster";
import { changePassword, saveDisplayName } from "@/lib/account/actions";

import { AccountSettings } from "./account";

vi.mock("@/components/app/toaster", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/account/actions", () => ({
  saveDisplayName: vi.fn(async () => ({ ok: true })),
  changePassword: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/components/app/theme-preference", () => ({
  useThemePreference: () => "system",
  setThemePreference: vi.fn(),
}));

function renderAccount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountSettings name="Ada" email="ada@lume.test" />
    </QueryClientProvider>,
  );
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings → Account (B6.2)", () => {
  it("saves a new name, trimmed, and only when it changed", async () => {
    renderAccount();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", true);
    expect(screen.getByText("ada@lume.test")).toBeTruthy();

    type("Name", "  Ada Lovelace ");
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(saveDisplayName).toHaveBeenCalledWith({ name: "Ada Lovelace" }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Name saved"),
    );
    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "Ada Lovelace",
    );
    expect(save).toHaveProperty("disabled", true);
  });

  it("won't save an empty name", async () => {
    renderAccount();
    type("Name", "   ");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Enter your name.",
    );
    expect(saveDisplayName).not.toHaveBeenCalled();
  });

  it("checks the new password before sending it", async () => {
    renderAccount();
    type("Current password", "old-password");
    type("New password", "short");
    type("Confirm new password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Use at least 8 characters.")).toBeTruthy();

    type("New password", "a-new-password");
    type("Confirm new password", "another-one");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The passwords don’t match.")).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("changes the password and clears the form", async () => {
    renderAccount();
    type("Current password", "old-password");
    type("New password", "a-new-password");
    type("Confirm new password", "a-new-password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        current: "old-password",
        next: "a-new-password",
        confirm: "a-new-password",
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Password changed",
        expect.anything(),
      ),
    );
    expect(screen.getByLabelText("Current password")).toHaveProperty(
      "value",
      "",
    );
  });

  it("says when the current password is wrong, by that field", async () => {
    vi.mocked(changePassword).mockResolvedValueOnce({
      ok: false,
      error: "That isn’t your current password.",
      field: "current",
    });
    renderAccount();
    type("Current password", "wrong-password");
    type("New password", "a-new-password");
    type("Confirm new password", "a-new-password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByText("That isn’t your current password."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Current password")).toHaveProperty(
      "ariaInvalid",
      "true",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows the theme and changes it", () => {
    // jsdom has no scrolling; the open list scrolls to the chosen option.
    Element.prototype.scrollIntoView ??= () => {};
    renderAccount();
    const theme = screen.getByLabelText("Theme");
    expect(theme.textContent).toContain("System");
    fireEvent.keyDown(theme, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Dark" }));
    expect(setThemePreference).toHaveBeenCalledWith("dark");
  });
});
