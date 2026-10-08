// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "@/components/features/auth/sign-in-form";
import { sendMagicLink, signIn } from "@/lib/auth/actions";

vi.mock("@/lib/auth/actions", () => ({
  signIn: vi.fn(),
  sendMagicLink: vi.fn(),
}));

const signInMock = vi.mocked(signIn);
const magicLinkMock = vi.mocked(sendMagicLink);

beforeEach(() => {
  signInMock.mockReset();
  magicLinkMock.mockReset();
});

const passwordForm = () =>
  screen.getByRole("form", { name: "Sign in with password" });
const linkForm = () =>
  screen.getByRole("form", { name: "Email me a sign-in link" });

describe("SignInForm", () => {
  it("shows field errors in the browser and does not call the server", async () => {
    render(<SignInForm />);
    fireEvent.change(within(passwordForm()).getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(
      within(passwordForm()).getByRole("button", { name: "Sign in" }),
    );

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(
      within(passwordForm())
        .getByLabelText("Email")
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("posts a valid form to the server action and shows its error", async () => {
    signInMock.mockResolvedValue({
      error: "That email and password don't match.",
      values: { email: "ada@example.com" },
    });
    render(<SignInForm />);
    fireEvent.change(within(passwordForm()).getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(within(passwordForm()).getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(
      within(passwordForm()).getByRole("button", { name: "Sign in" }),
    );

    const alert = await within(passwordForm()).findByRole("alert");
    expect(alert.textContent).toBe("That email and password don't match.");
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    const formData = signInMock.mock.calls[0]![1];
    expect(formData.get("email")).toBe("ada@example.com");
    expect(formData.get("password")).toBe("wrong-password");
  });

  it("confirms when a sign-in link was sent", async () => {
    magicLinkMock.mockResolvedValue({
      message: "Check your email for a sign-in link.",
    });
    render(<SignInForm />);
    fireEvent.change(
      within(linkForm()).getByLabelText("Email me a sign-in link"),
      {
        target: { value: "ada@example.com" },
      },
    );
    fireEvent.click(
      within(linkForm()).getByRole("button", { name: "Email me a link" }),
    );

    const status = await within(linkForm()).findByRole("status");
    expect(status.textContent).toBe("Check your email for a sign-in link.");
    expect(magicLinkMock).toHaveBeenCalledTimes(1);
  });
});
