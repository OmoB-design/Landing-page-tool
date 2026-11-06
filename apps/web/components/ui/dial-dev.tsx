"use client";

import "dialkit/styles.css";

import {
  type DialConfig,
  DialRoot,
  type UseDialOptions,
  useDialKit,
} from "dialkit";
import { type ComponentProps, useEffect } from "react";

/* DialKit itself, loaded only in development by ./dial.tsx. */

export function DevDial({
  name,
  config,
  options,
  onValues,
}: {
  name: string;
  config: DialConfig;
  options?: UseDialOptions;
  onValues: (values: unknown) => void;
}) {
  const values = useDialKit(name, config, options);
  useEffect(() => onValues(values), [values, onValues]);
  return null;
}

export function DevDialPanel(props: ComponentProps<typeof DialRoot>) {
  return <DialRoot {...props} />;
}
