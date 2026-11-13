"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function WorkspaceClerkProvider({ children }: { children: ReactNode }) {
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
      {children}
    </ClerkProvider>
  );
}
