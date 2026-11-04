"use client";

import { AnimatePresence, motion } from "motion/react";

import { ShimmerText } from "@/components/ui/shimmer-loader";
import { cn } from "@/lib/utils";

/**
 * The status line's words (AffectUI's Thinking Loader): a new label rolls in from below as the old
 * one rolls up and blurs out, and while Lander works a light sweeps over it. The line keeps one
 * row's height, so nothing below moves as the words change.
 */
export function RollingLabel({
  label,
  working,
  className,
}: {
  label: string;
  working: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-grid overflow-hidden", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={label}
          className="col-start-1 row-start-1 truncate"
          initial={{ y: "70%", opacity: 0, filter: "blur(3px)" }}
          animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-70%", opacity: 0, filter: "blur(3px)" }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          {working ? <ShimmerText>{label}</ShimmerText> : label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
