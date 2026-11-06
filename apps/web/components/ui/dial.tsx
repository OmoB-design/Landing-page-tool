"use client";

import type { DialConfig, ResolvedValues, UseDialOptions } from "dialkit";
import dynamic from "next/dynamic";
import { type ReactNode, useCallback, useMemo, useState } from "react";

/*
 * DialKit (the owner's tuning dials, figma-pixel-perfect skill) in development only (owner,
 * 2026-11-06: the speed pass). Production gets each dial's default, computed here from the dial's
 * config exactly as DialKit does, and never downloads DialKit (about 50 KB compressed, with its
 * styles, that used to load on every screen). In development DialKit loads on demand and its
 * live values replace the defaults.
 */

const DEV = process.env.NODE_ENV === "development";

const DevDial = DEV
  ? dynamic(() => import("./dial-dev").then((m) => m.DevDial), { ssr: false })
  : null;

/** DialKit's panel (development only; nothing in production). */
export const DialPanel = DEV
  ? dynamic(() => import("./dial-dev").then((m) => m.DevDialPanel), {
      ssr: false,
    })
  : () => null;

type Leaf = Record<string, unknown> & { type?: string };

function firstOption(options: unknown): string {
  const first = Array.isArray(options) ? options[0] : undefined;
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "value" in first) {
    return String((first as { value: unknown }).value);
  }
  return "";
}

/** A control's default, as DialKit's `configDefaultValue`. */
function leafDefault(value: unknown): unknown {
  if (Array.isArray(value)) return value[0];
  if (value && typeof value === "object") {
    const leaf = value as Leaf;
    if (leaf.type === "select" || leaf.type === "image") {
      return leaf.default ?? firstOption(leaf.options);
    }
    if (leaf.type === "color") return leaf.default ?? "#000000";
    if (leaf.type === "text") return leaf.default ?? "";
    if (leaf.type === "pad") return leaf.default ?? { x: 0, y: 0 };
  }
  return value;
}

function isLeaf(value: unknown): boolean {
  if (Array.isArray(value)) return typeof value[0] === "number";
  if (value === null || typeof value !== "object") return true;
  return typeof (value as Leaf).type === "string";
}

/** Every dial at its default, shaped as `useDialKit` returns them. */
export function dialDefaults<T extends DialConfig>(
  config: T,
): ResolvedValues<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "_collapsed") continue;
    out[key] = isLeaf(value)
      ? leafDefault(value)
      : dialDefaults(value as DialConfig);
  }
  return out as ResolvedValues<T>;
}

/**
 * The dial's values for its children: DialKit's live ones in development (the defaults until
 * DialKit has loaded), the defaults in production.
 */
export function Dial<T extends DialConfig>({
  name,
  config,
  options,
  children,
}: {
  name: string;
  config: T;
  options?: UseDialOptions;
  children: (values: ResolvedValues<T>) => ReactNode;
}) {
  const defaults = useMemo(() => dialDefaults(config), [config]);
  const [live, setLive] = useState<ResolvedValues<T> | null>(null);
  const onValues = useCallback(
    (next: ResolvedValues<T>) =>
      setLive((previous) =>
        previous && JSON.stringify(previous) === JSON.stringify(next)
          ? previous
          : next,
      ),
    [],
  );
  return (
    <>
      {DevDial ? (
        <DevDial
          name={name}
          config={config}
          options={options}
          onValues={onValues as (values: unknown) => void}
        />
      ) : null}
      {children(live ?? defaults)}
    </>
  );
}
