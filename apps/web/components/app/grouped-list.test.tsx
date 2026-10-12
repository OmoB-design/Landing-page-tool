// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GroupedList, ListGroup, ListRow } from "@/components/app/grouped-list";

function renderList() {
  return render(
    <GroupedList label="Pages by status">
      <ListGroup label="Building" count={1}>
        <ListRow href="/pages/a" title="Advertorial A" />
      </ListGroup>
      <ListGroup label="Needs review" count={2}>
        <ListRow href="/pages/b" title="Listicle B">
          <ListRow href="/pages/c" title="Listicle B re-build" level={1} />
        </ListRow>
      </ListGroup>
    </GroupedList>,
  );
}

const header = (name: RegExp) => screen.getByRole("button", { name });
const row = (name: string) => screen.getByRole("link", { name });

describe("GroupedList", () => {
  it("renders group headers with counts and rows as links", () => {
    renderList();
    expect(header(/Building\s*1/)).toBeTruthy();
    expect(header(/Needs review\s*2/)).toBeTruthy();
    expect(row("Advertorial A").getAttribute("href")).toBe("/pages/a");
  });

  it("nests child rows inside their parent row and indents them", () => {
    renderList();
    const parentItem = row("Listicle B").closest("li");
    expect(parentItem).not.toBeNull();
    const child = within(parentItem!).getByRole("link", {
      name: "Listicle B re-build",
    });
    expect(child.className).toContain("pl-12");
    expect(row("Listicle B").className).toContain("pl-4");
  });

  it("moves focus through headers and rows with the arrow keys, Home and End", () => {
    renderList();
    const order = [
      header(/Building/),
      row("Advertorial A"),
      header(/Needs review/),
      row("Listicle B"),
      row("Listicle B re-build"),
    ];
    order[0]!.focus();
    for (const next of order.slice(1)) {
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      expect(document.activeElement).toBe(next);
    }
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(order.at(-1));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(order.at(-2));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(order[0]);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(order.at(-1));
  });

  it("collapses and expands a group from its header", () => {
    renderList();
    const building = header(/Building/);
    expect(building.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(building);
    expect(building.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Advertorial A" })).toBeNull();
    fireEvent.click(building);
    expect(row("Advertorial A")).toBeTruthy();
  });

  it("skips collapsed rows when moving with the arrow keys", () => {
    renderList();
    fireEvent.click(header(/Building/));
    header(/Building/).focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(header(/Needs review/));
  });
});
