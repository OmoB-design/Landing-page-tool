"use client";

import { motion } from "motion/react";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { useLanderMotion } from "../lander-motion";

type Mark = "plain" | "bold" | "code";
type Piece = { text: string; mark: Mark };

/**
 * Lander's text as it writes it (owner, 2026-11-05: "make sure the text formatting is working"):
 * paragraphs split on a blank line, line breaks kept, **bold** and `code` marked, and a line that
 * starts with "- " or "* " drawn as a bullet. Anything else stays plain text: nothing is read as
 * HTML.
 */
export function formatted(text: string): Piece[][][] {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph.split("\n").map((raw) => {
        const line = raw.replace(/^\s*[-*]\s+/, "• ");
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
      }),
    );
}

/** The text without its marks, for screen readers and copying. */
export function plainText(text: string): string {
  return formatted(text)
    .map((p) =>
      p.map((line) => line.map((piece) => piece.text).join("")).join("\n"),
    )
    .join("\n\n");
}

/**
 * Text that arrives word by word, each word fading up out of a soft blur (the reference video's
 * reply; Sidekick's newest words grow from grey). It plays once, when it first shows; with reduced
 * motion the whole text just fades in. Paragraphs, line breaks, bold, code and bullets show as
 * Lander wrote them.
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
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="sr-only">{plainText(text)}</span>
      {paragraphs.map((lines, p) => (
        <p key={p} aria-hidden>
          {lines.map((pieces, l) => (
            <Fragment key={l}>
              {l > 0 ? <br /> : null}
              {pieces.map((piece, k) =>
                piece.text
                  .split(/(\s+)/)
                  .map((part, w) =>
                    /^\s+$/.test(part) || part === ""
                      ? part
                      : word(part, piece.mark, `${l}-${k}-${w}`),
                  ),
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
