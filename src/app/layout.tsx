import type { Metadata } from "next";
import "./globals.css";

// Resolve server credentials at request time, including in standalone containers.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CodeLens — Understand your codebase",
  description:
    "Your codebase, in focus. Explore architecture, documentation, and guided code tours in one developer workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
