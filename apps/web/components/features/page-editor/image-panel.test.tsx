// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageStudio } from "@/lib/validators/images";

import { ImagePanel, type Making } from "./image-panel";

const changeImage = vi.fn(async () => true);
vi.mock("../builds/desk-context", () => ({
  useDesk: () => ({ desk: { build: { page_version: 4 } }, changeImage }),
}));

const CDN = "https://cdn.example.test";
const STUDIO: ImageStudio = {
  image: {
    number: 3,
    src: `${CDN}/bath.jpg`,
    alt: "",
    kind: "scene",
    section: "faq",
    section_label: "Questions",
    ratio: "original",
    fit: "cover",
    focus: "center",
    changed: true,
  },
  versions: [
    {
      id: "6f0c9a52-6c8f-4a49-9a56-0d7f7c3f1a11",
      seq: 2,
      source: "product",
      src: `${CDN}/bath.jpg`,
      created_at: new Date().toISOString(),
      current: true,
    },
    {
      id: "0b9f8a4e-2d3c-4b1a-8e7f-6a5b4c3d2e10",
      seq: 1,
      source: "original",
      src: `${CDN}/old.jpg`,
      created_at: new Date().toISOString(),
      current: false,
    },
  ],
  product_photos: [
    { src: `${CDN}/front.jpg`, label: "Product photo 1" },
    { src: `${CDN}/bath.jpg`, label: "Product photo 2" },
  ],
  ai: { mock: true, price: "0.15" },
  making: null,
  page_images: [
    { src: `${CDN}/hero.jpg`, label: "Product photo in Hero", number: 2 },
  ],
};

const onMake = vi.fn(async () => {});

function renderPanel(making: Making | null = null) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ImagePanel
        buildId="b1"
        number={3}
        busy={null}
        onBack={vi.fn()}
        making={making}
        onMake={onMake}
        onAdopt={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(STUDIO), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  changeImage.mockClear();
  vi.unstubAllGlobals();
});

describe("image studio (B3.2a)", () => {
  it("replaces, crops, describes and restores the image it opened", async () => {
    renderPanel();
    expect(await screen.findByText(/Scene in Questions/)).toBeTruthy();
    // The photo already on the page is marked and can't be picked again.
    const onPage = screen.getByRole("button", {
      name: "Product photo 2 (on the page)",
    });
    expect((onPage as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Use Product photo 1" }),
    );
    expect(changeImage).toHaveBeenLastCalledWith(3, "replace", {
      src: `${CDN}/front.jpg`,
      source: "product",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use Product photo in Hero" }),
    );
    expect(changeImage).toHaveBeenLastCalledWith(3, "replace", {
      src: `${CDN}/hero.jpg`,
      source: "reused",
    });

    fireEvent.click(screen.getByRole("button", { name: "4:3" }));
    expect(changeImage).toHaveBeenLastCalledWith(3, "adjust", { ratio: "4:3" });
    fireEvent.click(screen.getByRole("button", { name: "Fit" }));
    expect(changeImage).toHaveBeenLastCalledWith(3, "adjust", {
      fit: "contain",
    });

    const alt = screen.getByLabelText("Alt text");
    fireEvent.change(alt, { target: { value: "  A warm bath  " } });
    fireEvent.keyDown(alt, { key: "Enter" });
    expect(changeImage).toHaveBeenLastCalledWith(3, "adjust", {
      alt: "A warm bath",
    });

    // The studio changed how it's shown, so Reset puts it back as it was built.
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(changeImage).toHaveBeenLastCalledWith(3, "adjust", {
      ratio: "original",
    });

    expect(screen.getByText("On the page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(changeImage).toHaveBeenLastCalledWith(3, "restore", {
      version_id: "0b9f8a4e-2d3c-4b1a-8e7f-6a5b4c3d2e10",
    });
  });

  it("makes a picture with AI from a description and product photos", async () => {
    renderPanel();
    await screen.findByText(/Scene in Questions/);
    const prompt = screen.getByLabelText("Describe the new picture");
    fireEvent.change(prompt, { target: { value: "A warm bath at dusk" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Use Product photo 1 as a reference",
      }),
    );
    const make = screen.getByRole("button", { name: /Make a new picture/ });
    expect(make.textContent).toContain("free placeholder"); // mock mode
    fireEvent.click(make);
    expect(onMake).toHaveBeenLastCalledWith(3, {
      mode: "generate",
      prompt: "A warm bath at dusk",
      product_photos: [1],
    });
    const edit = screen.getByRole("button", { name: "Edit this one" });
    await waitFor(() =>
      expect((edit as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(edit);
    expect(
      screen.getByLabelText("Say what to change in the picture"),
    ).toBeTruthy();
  });

  it("shows the picture being made", async () => {
    renderPanel({ mode: "edit", startedAt: Date.now() });
    expect(await screen.findByText("Editing the picture…")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Edit the picture/ }),
    ).toBeNull();
  });

  it("says so when the image has left the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "That page isn't available." }),
            {
              status: 404,
            },
          ),
      ),
    );
    renderPanel();
    await waitFor(() =>
      expect(
        screen.getByText("This image isn’t on the page any more."),
      ).toBeTruthy(),
    );
  });
});
