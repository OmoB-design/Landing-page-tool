import type { Metadata } from "next";
import {
  Crimson_Pro,
  Geist,
  Geist_Mono,
  Inter,
  Inter_Tight,
  JetBrains_Mono,
} from "next/font/google";

import { InlineScript } from "@/components/app/inline-script";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PRE_PAINT_SCRIPT } from "@/lib/preferences";
import { cn } from "@/lib/utils";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});
// Letter marks on workspaces, people and brands (Figma side nav).
const geist = Geist({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-geist",
});
// Dialog titles (Figma: Inter Tight Medium; the published modal).
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-inter-tight",
});
// Web addresses (Figma: Geist Mono; the published modal).
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-geist-mono",
});
// Page greetings and big titles (D67).
const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  variable: "--font-crimson",
});

export const metadata: Metadata = {
  title: { default: "LP Platform", template: "%s · LP Platform" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the pre-paint script sets the theme class and sidebar state on
    // <html> before React hydrates, and some browser extensions add attributes to it.
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        inter.variable,
        jetbrainsMono.variable,
        crimsonPro.variable,
        geist.variable,
        interTight.variable,
        geistMono.variable,
      )}
    >
      <head>
        <InlineScript html={PRE_PAINT_SCRIPT} />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
