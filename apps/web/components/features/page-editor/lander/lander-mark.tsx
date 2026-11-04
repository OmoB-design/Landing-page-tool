"use client";

import { motion } from "motion/react";

import { SparkleFigmaIcon } from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";

/**
 * Lander's mark (B3.1b, D105; until the owner designs a character): the sparkle on a soft purple
 * disc, 24 px in the bar and the composer, 44 px over the empty thread. While Lander works the
 * sparkle breathes (a slow scale and turn), and holds still with reduced motion.
 */
export function LanderMark({
  size = "sm",
  working = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  working?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-highlight-purple-50 text-spot-500-purple",
        size === "sm" && "size-6",
        size === "md" && "size-7",
        size === "lg" && "size-11",
        className,
      )}
    >
      <motion.span
        className="flex"
        animate={
          working
            ? { scale: [1, 1.14, 1], rotate: [0, 18, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={
          working
            ? { duration: 1.8, ease: "easeInOut", repeat: Infinity }
            : { duration: 0.3 }
        }
      >
        <SparkleFigmaIcon
          className={cn(
            size === "lg" ? "size-5.5" : size === "md" ? "size-4" : "size-3.5",
          )}
        />
      </motion.span>
    </span>
  );
}
