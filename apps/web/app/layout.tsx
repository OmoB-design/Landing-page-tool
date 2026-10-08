import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

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
      className={cn(inter.variable, jetbrainsMono.variable)}
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
