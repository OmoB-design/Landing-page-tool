"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deriveDark, deriveTint } from "@/lib/brands/palette";
import type { DeskPalette } from "@/lib/validators/desk";

import { useDesk } from "./desk-context";
import { CollapsibleSection } from "./panel-section";

const ROLES = [
  ["primary", "Primary"],
  ["dark", "Dark"],
  ["tint", "Tint"],
  ["accent", "Accent"],
] as const;

function same(a: DeskPalette, b: DeskPalette): boolean {
  return ROLES.every(
    ([role]) => a[role].toLowerCase() === b[role].toLowerCase(),
  );
}

/**
 * Colours (D86; the desk's Overview): the four colours on the page, and the ones to recolour it
 * to, starting from the brand's. Changing the primary derives a new dark and tint, as the brand
 * form does. Recolour page swaps them in (text on them turns black or white to stay readable) as
 * a change you can undo. Built in the panel's style; to be designed in Figma (state 14).
 */
export function InksCard() {
  const { desk, recolor, pending, redrafting } = useDesk();
  const { page, brand } = desk.colors;
  const [picked, setPicked] = useState<DeskPalette | null>(null);
  const target = picked ?? brand ?? page;
  const busy = pending !== null || redrafting !== null;

  const set = (role: keyof DeskPalette, hex: string) => {
    const base = target ?? { primary: hex, dark: hex, tint: hex, accent: hex };
    setPicked(
      role === "primary"
        ? {
            ...base,
            primary: hex,
            dark: deriveDark(hex) ?? base.dark,
            tint: deriveTint(hex) ?? base.tint,
          }
        : { ...base, [role]: hex },
    );
  };

  return (
    <div className="pt-2">
      <CollapsibleSection title="Colours" defaultOpen>
        {!page || !target ? (
          <p className="rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium text-heading-05">
            This page’s colours aren’t known, so it can’t be recoloured here.
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-md bg-foreground-01 p-1.5 text-type-caption-1 font-medium">
            <div className="flex items-center justify-between gap-2">
              <span className="text-heading-02">On the page</span>
              <div className="flex gap-1.5">
                {ROLES.map(([role, name]) => (
                  <span
                    key={role}
                    role="img"
                    aria-label={`${name} ${page[role]}`}
                    title={`${name} ${page[role]}`}
                    className="size-7 rounded-sm border-(length:--line-hairline) border-stroke-strong"
                    style={{ backgroundColor: page[role] }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-heading-02">Recolour to</span>
              <div className="flex gap-1.5">
                {ROLES.map(([role, name]) => (
                  <input
                    key={role}
                    type="color"
                    aria-label={`${name} colour`}
                    title={`${name} ${target[role]}`}
                    value={target[role]}
                    disabled={busy}
                    onChange={(event) => set(role, event.target.value)}
                    className="size-7 cursor-pointer rounded-sm border-(length:--line-hairline) border-stroke-strong bg-surface-primary p-0.5 disabled:cursor-default disabled:opacity-50"
                  />
                ))}
              </div>
            </div>
            <p className="text-type-caption-2 text-heading-05">
              Primary, dark, tint and accent. Text on them turns black or white
              to stay readable.
            </p>
            <div className="flex justify-end gap-1.5">
              {brand && !same(target, brand) ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={busy}
                  onClick={() => setPicked(null)}
                >
                  Brand colours
                </Button>
              ) : null}
              <Button
                type="button"
                size="compact"
                disabled={busy || same(target, page)}
                onClick={async () => {
                  if (await recolor(target)) setPicked(null);
                }}
              >
                {pending === "recolor" ? (
                  <Spinner className="size-3.5" label="Recolouring" />
                ) : null}
                Recolour page
              </Button>
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
