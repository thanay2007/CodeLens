"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { Dashboard } from "./dashboard";

export default function Workspace({ clerkEnabled }: { clerkEnabled: boolean }) {
  const dashboard = <Dashboard clerkEnabled={clerkEnabled} />;

  if (!clerkEnabled) return dashboard;

  return (
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
      {dashboard}
    </ClerkProvider>
  );
}
