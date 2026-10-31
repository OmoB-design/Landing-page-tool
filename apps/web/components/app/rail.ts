import type { CSSProperties } from "react";

/**
 * A label's place from the top in the sidebar rail's stagger (D97): `--i` in app/globals.css
 * (`rail-label`, `rail-fade`). Inherited, so a wrapper can set it for everything inside.
 */
export function railIndex(index = 0) {
  return { "--i": index } as CSSProperties;
}
