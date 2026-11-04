"use client";

import { motion } from "motion/react";

import { useLanderMotion } from "../lander-motion";

/**
 * Text that arrives word by word, each word fading up out of a soft blur (the reference video's
 * reply; Sidekick's newest words grow from grey). It plays once, when it first shows; with reduced
 * motion the whole line just fades in.
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
  const words = text.split(/(\s+)/);
  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, i) =>
          /^\s+$/.test(word) ? (
            word
          ) : (
            <motion.span
              key={i}
              className="inline-block"
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
              {word}
            </motion.span>
          ),
        )}
      </span>
    </p>
  );
}
