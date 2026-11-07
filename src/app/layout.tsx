import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

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
          <ClerkProvider
            appearance={{
              variables: {
                colorPrimary: "#8b5cf6",
                colorBackground: "#151519",
                colorForeground: "#fafafa",
                colorInput: "#202026",
                colorInputForeground: "#fafafa",
              },
            }}
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
