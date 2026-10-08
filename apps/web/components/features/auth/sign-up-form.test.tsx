// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignUpForm } from "@/components/features/auth/sign-up-form";
import { signUp } from "@/lib/auth/actions";

vi.mock("@/lib/auth/actions", () => ({ signUp: vi.fn() }));

const signUpMock = vi.mocked(signUp);

beforeEach(() => signUpMock.mockReset());

function fill(name: string, email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("SignUpForm", () => {
  it("shows the password hint until there is an error", async () => {
    render(<SignUpForm />);
    expect(screen.getByText("At least 8 characters.")).toBeTruthy();

    fill("Ada", "ada@example.com", "short");
    expect(await screen.findByText("Use at least 8 characters.")).toBeTruthy();
    expect(screen.queryByText("At least 8 characters.")).toBeNull();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("shows the server's message when the account already exists", async () => {
    signUpMock.mockResolvedValue({
      error: "An account with this email already exists. Sign in instead.",
    });
    render(<SignUpForm />);
    fill("Ada", "ada@example.com", "long-enough-password");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "An account with this email already exists. Sign in instead.",
    );
    expect(signUpMock).toHaveBeenCalledTimes(1);
  });
});
