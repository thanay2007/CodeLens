import type { Metadata } from "next";
import { WorkspaceClerkProvider } from "@/components/auth/workspace-clerk-provider";
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
  const clerkEnabled = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
  return (
    <html lang="en" className="dark">
      <body>
        {clerkEnabled ? (
          <WorkspaceClerkProvider>{children}</WorkspaceClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
