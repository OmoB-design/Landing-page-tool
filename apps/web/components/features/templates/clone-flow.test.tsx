// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CloneFlow } from "@/components/features/templates/clone-flow";
import { cloneRequestSchema } from "@/lib/validators/clone";
import type { CloneTermsState } from "@/lib/validators/clone";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const JOB = {
  id: "5f0c2a7e-1b3d-4e5f-8a9b-0c1d2e3f4a5b",
  kind: "template_clone",
  status: "queued",
  attempts: 0,
  max_attempts: 1,
  result: null,
  error: null,
  created_by: null,
  created_at: "2026-10-30T10:00:00Z",
  started_at: null,
  finished_at: null,
};

const NOT_ACCEPTED: CloneTermsState = {
  clone_enabled: true,
  accepted_at: null,
  accepted_by: null,
  can_accept: true,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("CloneFlow", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the terms on the first clone, then accepts them and starts the clone", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/clone-terms")
        return json({
          ...NOT_ACCEPTED,
          accepted_at: "2026-10-30T10:00:00Z",
          accepted_by: "Bolaji",
        });
      if (url === "/api/templates/clone") return json({ job: JOB }, 201);
      return json({ ...JOB, events: [] });
    });
    render(<CloneFlow initialTerms={NOT_ACCEPTED} workspace="Adcubator" />, {
      wrapper,
    });
    expect(
      screen.getByText(/You’ll accept the clone terms for Adcubator first/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Page address"), {
      target: { value: "resilia.shop/pages/gut" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clone page" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Placeholder wording/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Accept and clone" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/templates/clone",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/templates/clone",
    )!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      url: "resilia.shop/pages/gut",
      type: "advertorial",
    });
    expect(await screen.findByText("Cloning the page")).toBeTruthy();
    expect(screen.getByText(/Clone terms accepted by Bolaji/)).toBeTruthy();
  });

  it("lets a member read the terms but not accept them", async () => {
    render(
      <CloneFlow
        initialTerms={{ ...NOT_ACCEPTED, can_accept: false }}
        workspace="Adcubator"
      />,
      { wrapper },
    );
    fireEvent.change(screen.getByLabelText("Page address"), {
      target: { value: "https://resilia.shop/pages/gut" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clone page" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Only an owner or admin can accept these/),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "Accept and clone" }),
    ).toBeNull();
  });

  it("checks the address, and takes pasted HTML with where it came from", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/templates/clone"
        ? json({ job: JOB }, 201)
        : json({ ...JOB, events: [] }),
    );
    render(
      <CloneFlow
        initialTerms={{
          ...NOT_ACCEPTED,
          accepted_at: "2026-10-30T10:00:00Z",
        }}
        workspace="Adcubator"
      />,
      { wrapper },
    );
    fireEvent.change(screen.getByLabelText("Page address"), {
      target: { value: "not an address" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clone page" }));
    expect(screen.getByText(/Enter a web address/)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Paste HTML" }));
    fireEvent.change(screen.getByLabelText("Page HTML"), {
      target: { value: "<html><body>A page</body></html>" },
    });
    fireEvent.change(screen.getByLabelText(/Where it came from/), {
      target: { value: "https://resilia.shop/pages/gut" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clone page" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/templates/clone",
        expect.anything(),
      ),
    );
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/templates/clone",
    )!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      html: "<html><body>A page</body></html>",
      source_url: "https://resilia.shop/pages/gut",
    });
    expect(await screen.findByText("Read the pasted page")).toBeTruthy();
  });

  it("shows what was cloned with its warnings when the job finishes", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/templates/clone"
        ? json({ job: JOB }, 201)
        : json({
            ...JOB,
            status: "succeeded",
            events: [],
            result: {
              template_id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
              name: "Gut Lander – Resilia",
              source_url: "https://resilia.shop/pages/gut",
              source_host: "resilia.shop",
              source_name: "Resilia",
              platform: "shopify",
              verdict: null,
              warnings: ["Couldn't download 2 of the page's stylesheets."],
              stats: {},
            },
          }),
    );
    render(
      <CloneFlow
        initialTerms={{ ...NOT_ACCEPTED, accepted_at: "2026-10-30T10:00:00Z" }}
        workspace="Adcubator"
      />,
      { wrapper },
    );
    fireEvent.change(screen.getByLabelText("Page address"), {
      target: { value: "https://resilia.shop/pages/gut" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clone page" }));
    expect(await screen.findByText("Gut Lander – Resilia")).toBeTruthy();
    expect(
      screen.getByText(/Cloned from resilia.shop, built with Shopify/),
    ).toBeTruthy();
    expect(screen.getByText(/2 of the page's stylesheets/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "See it in Yours" })
        .getAttribute("href"),
    ).toBe("/templates?view=yours");
  });

  it("says so when cloning is off for the workspace", () => {
    render(
      <CloneFlow
        initialTerms={{ ...NOT_ACCEPTED, clone_enabled: false }}
        workspace="Adcubator"
      />,
      { wrapper },
    );
    expect(screen.getByText(/Cloning is switched off/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clone page" })).toBeNull();
  });
});

describe("cloneRequestSchema", () => {
  it("needs exactly one of an address and HTML", () => {
    expect(cloneRequestSchema.safeParse({ type: "advertorial" }).success).toBe(
      false,
    );
    expect(
      cloneRequestSchema.safeParse({
        type: "advertorial",
        url: "https://a.test/x",
        html: "<html></html>",
      }).success,
    ).toBe(false);
    expect(
      cloneRequestSchema.safeParse({ type: "listicle", url: "a.test/x" })
        .success,
    ).toBe(true);
  });
});
