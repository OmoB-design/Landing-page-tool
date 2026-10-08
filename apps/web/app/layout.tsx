import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LP Platform", template: "%s · LP Platform" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
