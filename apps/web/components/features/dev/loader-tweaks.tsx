"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { setThemePreference } from "@/components/app/theme-preference";
import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";
type Motion = "ui-shm-sweep" | "skeleton-pulse" | "none";
type Tweaks = {
  /** Percent. */
  opacity: number;
  /** A colour token name. */
  base: string;
  motion: Motion;
  /** Strength of the sweeping light, percent (sweep only). */
  glow: number;
  /** Seconds for one sweep or breath. */
  speed: number;
  /** Milliseconds before a skeleton shows. */
  delay: number;
  /** Milliseconds to fade in. */
  fade: number;
};

/** The defaults in app/globals.css (`--skeleton-*`): Quality's pulse at the owner's tuning. */
const DEFAULTS: Record<Theme, Tweaks> = {
  light: {
    opacity: 20,
    base: "foreground-03",
    motion: "skeleton-pulse",
    glow: 0,
    speed: 2,
    delay: 150,
    fade: 225,
  },
  dark: {
    opacity: 15,
    base: "foreground-02",
    motion: "skeleton-pulse",
    glow: 0,
    speed: 2,
    delay: 150,
    fade: 300,
  },
};

const BASES = [
  { id: "foreground-01", label: "Foreground-01" },
  { id: "foreground-02", label: "Foreground-02" },
  { id: "foreground-03", label: "Foreground-03" },
  { id: "stroke", label: "Stroke" },
  { id: "stroke-strong", label: "Stroke-Strong" },
];

const MOTIONS: { id: Motion; label: string }[] = [
  { id: "ui-shm-sweep", label: "Sweep" },
  { id: "skeleton-pulse", label: "Pulse" },
  { id: "none", label: "Still" },
];

const STORAGE_KEY = "lp-dev-loader-tweaks";

function variables(tweaks: Tweaks): Record<string, string> {
  // The sweep's light only shows while sweeping; breathing and still skeletons have none.
  const glow = tweaks.motion === "ui-shm-sweep" ? tweaks.glow : 0;
  return {
    "--skeleton-opacity": String(tweaks.opacity / 100),
    "--skeleton-base": `var(--color-${tweaks.base})`,
    "--skeleton-glow": `color-mix(in srgb, var(--color-on-dark) ${glow}%, transparent)`,
    "--skeleton-speed": `${tweaks.speed}s`,
    "--skeleton-delay": `${tweaks.delay}ms`,
    "--skeleton-fade": `${tweaks.fade}ms`,
    "--skeleton-motion": tweaks.motion,
    // The pulse eases like Tailwind's; a sweep runs at an even pace.
    "--skeleton-ease":
      tweaks.motion === "skeleton-pulse"
        ? "cubic-bezier(0.4, 0, 0.6, 1)"
        : "linear",
  };
}

function block(selector: string, tweaks: Tweaks): string {
  const lines = Object.entries(variables(tweaks)).map(
    ([name, value]) => `  ${name}: ${value};`,
  );
  return `${selector} {\n${lines.join("\n")}\n}`;
}

// ── Saved values (this browser) ─────────────────────────────────────────────

const listeners = new Set<() => void>();
let memory = "";

function subscribeSaved(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readSaved(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return memory;
  }
}

function save(value: Record<Theme, Tweaks> | null) {
  memory = value ? JSON.stringify(value) : "";
  try {
    if (value) localStorage.setItem(STORAGE_KEY, memory);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): kept in memory until the page is reloaded.
  }
  for (const listener of listeners) listener();
}

function parse(raw: string): Record<Theme, Tweaks> {
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<Theme, Partial<Tweaks>>>;
    return {
      light: { ...DEFAULTS.light, ...parsed.light },
      dark: { ...DEFAULTS.dark, ...parsed.dark },
    };
  } catch {
    return DEFAULTS;
  }
}

// ── The theme on <html> ─────────────────────────────────────────────────────

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * The loaders' tweak panel (development only): strength, fill, motion, timing for each theme,
 * applied live to every skeleton on the page. Kept in this browser; Copy gives the CSS that makes
 * them the defaults in app/globals.css.
 */
export function LoaderTweaks() {
  const raw = useSyncExternalStore(subscribeSaved, readSaved, () => "");
  const all = useMemo(() => parse(raw), [raw]);
  const theme = useSyncExternalStore(
    subscribeTheme,
    readTheme,
    (): Theme => "light",
  );
  const current = all[theme];

  // Apply the current theme's values to <html>; leaving the page puts the defaults back.
  useEffect(() => {
    const root = document.documentElement;
    const values = variables(current);
    for (const [name, value] of Object.entries(values)) {
      root.style.setProperty(name, value);
    }
    return () => {
      for (const name of Object.keys(values)) root.style.removeProperty(name);
    };
  }, [current]);

  const update = (patch: Partial<Tweaks>) =>
    save({ ...all, [theme]: { ...current, ...patch } });

  const copy = async () => {
    const css = `${block(":root", all.light)}\n\n${block(".dark", all.dark)}`;
    try {
      await navigator.clipboard.writeText(css);
      toast.success("Copied. Paste it to Claude to make it the default.");
    } catch {
      toast.error("Couldn't copy from this page.");
    }
  };

  return (
    <aside
      aria-label="Loader tweaks"
      className="fixed top-16 right-6 z-50 flex max-h-svh w-72 flex-col gap-4 overflow-y-auto rounded-lg bg-surface-modal p-4 shadow-float edge-hairline"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-type-body-small font-medium text-heading-01">
          Loader tweaks
        </h2>
        <div className="flex gap-0.5 rounded-md bg-foreground-01 p-0.5">
          {(["light", "dark"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={theme === option}
              onClick={() => setThemePreference(option)}
              className={cn(
                "rounded-sm px-2 py-0.5 text-type-caption-1 font-medium text-heading-04 capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring",
                theme === option &&
                  "bg-surface-primary text-heading-01 shadow-light",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <Range
        label="Opacity"
        value={current.opacity}
        display={`${current.opacity}%`}
        min={0}
        max={100}
        step={5}
        onChange={(opacity) => update({ opacity })}
      />

      <Choice
        label="Fill"
        value={current.base}
        options={BASES}
        onChange={(base) => update({ base })}
      />

      <Choice
        label="Motion"
        value={current.motion}
        options={MOTIONS}
        onChange={(motion) => update({ motion: motion as Motion })}
      />

      {current.motion === "ui-shm-sweep" ? (
        <Range
          label="Sweep light"
          value={current.glow}
          display={`${current.glow}%`}
          min={0}
          max={100}
          step={1}
          onChange={(glow) => update({ glow })}
        />
      ) : null}

      {current.motion !== "none" ? (
        <Range
          label="Speed"
          value={current.speed}
          display={`${current.speed.toFixed(1)} s`}
          min={0.8}
          max={4}
          step={0.1}
          onChange={(speed) => update({ speed })}
        />
      ) : null}

      <Range
        label="Delay before showing"
        value={current.delay}
        display={`${current.delay} ms`}
        min={0}
        max={600}
        step={25}
        onChange={(delay) => update({ delay })}
      />

      <Range
        label="Fade in"
        value={current.fade}
        display={`${current.fade} ms`}
        min={0}
        max={800}
        step={25}
        onChange={(fade) => update({ fade })}
      />

      <p className="text-type-caption-2 text-heading-05">
        Each theme keeps its own values, saved in this browser. Replay shows the
        delay and fade again; Copy gives the CSS to make them the default.
      </p>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="compact"
          className="flex-1"
          onClick={() => save(null)}
        >
          Reset
        </Button>
        <Button
          variant="outline"
          size="compact"
          className="flex-1"
          onClick={replay}
        >
          Replay
        </Button>
        <Button size="compact" className="flex-1" onClick={copy}>
          Copy CSS
        </Button>
      </div>
    </aside>
  );
}

/** Restarts every skeleton's animations, so the delay and fade-in play again. */
function replay() {
  for (const element of document.querySelectorAll<HTMLElement>(".ui-shm")) {
    for (const animation of element.getAnimations()) {
      animation.cancel();
      animation.play();
    }
  }
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-type-caption-1 font-medium text-heading-02">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Range({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-type-caption-1 font-medium text-heading-02">
        {label}
        <span className="text-heading-04 tabular-nums">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-spot-500-indigo"
      />
    </label>
  );
}
