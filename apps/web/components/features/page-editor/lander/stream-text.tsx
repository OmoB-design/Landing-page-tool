"use client";

import { motion } from "motion/react";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { useLanderMotion } from "../lander-motion";

type Mark = "plain" | "bold" | "code";
type Piece = { text: string; mark: Mark };
/** One line: plain text, a bullet ("- "), or a numbered item ("1. ", "2)"). */
export type Line = {
  kind: "text" | "bullet" | "number";
  /** A numbered item's number, as written. */
  number?: string;
  pieces: Piece[];
};

function pieces(line: string): Piece[] {
  return line
    .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/)
    .filter(Boolean)
    .map((part): Piece =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4
        ? { text: part.slice(2, -2), mark: "bold" }
        : part.startsWith("`") && part.endsWith("`") && part.length > 2
          ? { text: part.slice(1, -1), mark: "code" }
          : { text: part, mark: "plain" },
    );
}

/**
 * Lander's text as it writes it (owner, 2026-11-05: "make sure the text formatting is working"):
 * paragraphs split on a blank line, line breaks kept, **bold** and `code` marked, a line that
 * starts with "- " or "* " a bullet, and one that starts with "1. " or "1)" a numbered item (owner:
 * findings and fixes to pick from read as numbered points). Anything else stays plain text:
 * nothing is read as HTML.
 */
export function formatted(text: string): Line[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph.split("\n").map((raw): Line => {
        const numbered = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(raw);
        if (numbered)
          return {
            kind: "number",
            number: numbered[1],
            pieces: pieces(numbered[2] ?? ""),
          };
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(raw);
        if (bullet) return { kind: "bullet", pieces: pieces(bullet[1] ?? "") };
        return { kind: "text", pieces: pieces(raw) };
      }),
    );
}

/** The text without its marks, for screen readers and copying. */
export function plainText(text: string): string {
  return formatted(text)
    .map((p) =>
      p
        .map(
          (line) =>
            (line.kind === "number"
              ? `${line.number}. `
              : line.kind === "bullet"
                ? "• "
                : "") + line.pieces.map((piece) => piece.text).join(""),
        )
        .join("\n"),
    )
    .join("\n\n");
}

/**
 * Text that arrives word by word, each word fading up out of a soft blur (the reference video's
 * reply; Sidekick's newest words grow from grey). It plays once, when it first shows; with reduced
 * motion the whole text just fades in. Paragraphs, line breaks, bold, code, bullets and numbered
 * points show as Lander wrote them.
 */
export function StreamText({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  /** Seconds before the first word. */
  delay?: number;
}) {
  const { wordStagger, wordBlur, reduced } = useLanderMotion();
  const paragraphs = formatted(text);
  let index = 0;
  const word = (value: string, mark: Mark, key: string) => {
    const i = index++;
    return (
      <motion.span
        key={key}
        className={cn(
          "inline-block",
          mark === "bold" && "font-medium text-heading-01",
          mark === "code" &&
            "rounded-xsm bg-foreground-02 px-1 font-mono text-type-caption-1",
        )}
        initial={{
          opacity: 0,
          filter: `blur(${wordBlur}px)`,
          y: reduced ? 0 : 2,
        }}
        animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={{
          duration: reduced ? 0.2 : 0.42,
          ease: [0.22, 1, 0.36, 1],
          delay: delay + (reduced ? 0 : (i / 2) * wordStagger),
        }}
      >
        {value}
      </motion.span>
    );
  };
  const words = (line: Line, key: string) =>
    line.pieces.map((piece, k) =>
      piece.text
        .split(/(\s+)/)
        .map((part, w) =>
          /^\s+$/.test(part) || part === ""
            ? part
            : word(part, piece.mark, `${key}-${k}-${w}`),
        ),
    );
  // A list item's marker arrives with its first word.
  const marker = (line: Line) => (
    <motion.span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        line.kind === "number"
          ? "mt-0.5 h-4 min-w-4 rounded-full bg-surface-primary px-1 text-type-caption-2 font-medium text-heading-02 tabular-nums shadow-light ring-thin ring-stroke"
          : "mt-2 size-1 rounded-full bg-heading-06",
      )}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: reduced ? 0.2 : 0.3,
        ease: [0.22, 1, 0.36, 1],
        delay: delay + (reduced ? 0 : (index / 2) * wordStagger),
      }}
    >
      {line.kind === "number" ? line.number : null}
    </motion.span>
  );
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="sr-only">{plainText(text)}</span>
      {paragraphs.map((lines, p) => {
        if (lines.every((line) => line.kind === "text"))
          return (
            <p key={p} aria-hidden>
              {lines.map((line, l) => (
                <Fragment key={l}>
                  {l > 0 ? <br /> : null}
                  {words(line, `${p}-${l}`)}
                </Fragment>
              ))}
            </p>
          );
        // Text lines and list items (a numbered item: a white number chip with a thin ring; a bullet: a
        // dot), each item's text hanging beside its marker.
        return (
          <div key={p} aria-hidden className="flex flex-col gap-1.5">
            {lines.map((line, l) =>
              line.kind === "text" ? (
                <p key={l}>{words(line, `${p}-${l}`)}</p>
              ) : (
                <div key={l} className="flex items-start gap-2">
                  {marker(line)}
                  <span className="min-w-0 flex-1">
                    {words(line, `${p}-${l}`)}
                  </span>
                </div>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
