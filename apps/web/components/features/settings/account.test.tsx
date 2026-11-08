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

/** Opens the password modal from its row. */
function openPassword() {
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  return screen.getByRole("dialog");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings → Account (B6.2, B6.3)", () => {
  it("saves a new name, trimmed, when you leave the field, and only when it changed", async () => {
    renderAccount();
    expect(screen.getByLabelText("Email")).toHaveProperty(
      "value",
      "ada@lume.test",
    );
    const name = screen.getByLabelText("Name");
    fireEvent.blur(name);
    expect(saveDisplayName).not.toHaveBeenCalled();

    type("Name", "  Ada Lovelace ");
    fireEvent.blur(name);
    await waitFor(() =>
      expect(saveDisplayName).toHaveBeenCalledWith({ name: "Ada Lovelace" }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Name saved"),
    );
    expect(name).toHaveProperty("value", "Ada Lovelace");
    fireEvent.blur(name);
    expect(saveDisplayName).toHaveBeenCalledTimes(1);
  });

  it("saves on Enter, and Escape puts the name back without saving", async () => {
    renderAccount();
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    name.focus();
    type("Name", "Ada L");
    fireEvent.keyDown(name, { key: "Escape" });
    expect(name.value).toBe("Ada");
    expect(saveDisplayName).not.toHaveBeenCalled();

    name.focus();
    type("Name", "Ada King");
    fireEvent.keyDown(name, { key: "Enter" });
    await waitFor(() =>
      expect(saveDisplayName).toHaveBeenCalledWith({ name: "Ada King" }),
    );
  });

  it("won't save an empty name", async () => {
    renderAccount();
    type("Name", "   ");
    fireEvent.blur(screen.getByLabelText("Name"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Enter your name.",
    );
    expect(saveDisplayName).not.toHaveBeenCalled();
  });

  it("checks the new password before sending it", async () => {
    renderAccount();
    openPassword();
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

  it("changes the password and closes the modal", async () => {
    renderAccount();
    openPassword();
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
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Opened again, the form is empty.
    openPassword();
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
    openPassword();
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
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows the theme as three pictures and changes it", () => {
    renderAccount();
    const system = screen.getByRole("radio", { name: "System" });
    expect(system).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: "Light" })).toHaveProperty(
      "checked",
      false,
    );
    for (const theme of ["system", "light", "dark"]) {
      expect(
        document.querySelector(`[data-illustration="theme-${theme}"]`),
      ).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(setThemePreference).toHaveBeenCalledWith("dark");
  });
});
