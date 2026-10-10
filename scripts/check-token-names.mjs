// Fails when web code uses a design-token name retired by D68 (Figma token names): the old colour
// classes (bg-surface, text-fg-muted, border-border …), Tailwind's default type and radius scales
// (text-sm, rounded-xs …) and the old CSS variables. Covers components/ui too.
// The current names are in apps/web/app/globals.css and the Figma file's Variables.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "apps", "web");
const dirs = ["app", "components", "lib"].map((d) => join(root, d));

const OLD_COLOURS = [
  "canvas",
  "surface",
  "surface-muted",
  "surface-hover",
  "surface-active",
  "border",
  "border-strong",
  "fg",
  "fg-muted",
  "fg-subtle",
  "accent",
  "accent-strong",
  "accent-soft",
  "success",
  "warning",
  "danger",
  "success-soft",
  "warning-soft",
  "danger-soft",
  "highlight",
  "highlight-soft",
  "glyph-advertorial",
  "glyph-listicle",
  "glyph-versus",
  "glyph-comparison",
  "glyph-longform",
  "mark-[a-h]",
  "mark-[a-h]-soft",
].join("|");
const UTIL =
  "bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide(?:-[xy])?|from|via|to|decoration|accent|caret|shadow";
const B = "(?<![\\w-])";
const E = "(?![\\w-])";
const RULES = [
  [
    new RegExp(`${B}(?:${UTIL})-(?:${OLD_COLOURS})${E}`, "g"),
    "old colour class",
  ],
  [
    new RegExp(`${B}text-(?:xs|sm|base|md|lg|xl|[2-9]xl|display)${E}`, "g"),
    "old type size (use text-type-*)",
  ],
  [
    new RegExp(
      `${B}rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?-(?:xs|[2-4]xl)${E}`,
      "g",
    ),
    "old radius",
  ],
  [new RegExp(`--color-(?:${OLD_COLOURS})${E}`, "g"), "old colour variable"],
  [
    new RegExp(`--(?:text-(?:xs|sm|base|md|lg|xl|display)|radius-xs)${E}`, "g"),
    "old type or radius variable",
  ],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(tsx?|css)$/.test(name)) yield path;
  }
}

const problems = [];
for (const dir of dirs) {
  for (const file of files(dir)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const [re, what] of RULES) {
        for (const m of line.matchAll(re))
          problems.push(`${relative(root, file)}:${i + 1}: ${m[0]} (${what})`);
      }
    });
  }
}

if (problems.length) {
  console.log(
    "Retired design-token names found. Use the Figma token names (DECISIONS.md D68, docs/DESIGN.md §4):",
  );
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("Token name check passed.");
