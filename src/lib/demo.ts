/** All analysis shown in the starter is this fictional, explicitly labeled fixture. */
export const demoRepository = {
  owner: "acme",
  name: "storefront",
  branch: "main",
  description: "A modern, full-stack commerce experience built for the web.",
  files: 128,
  lines: "12.4k",
  languages: 4,
  health: 85,
};

export const architecture = `flowchart LR
  UI["Next.js Frontend"] --> API["API Routes"]
  API --> DB[("PostgreSQL")]
  API --> AUTH["Clerk Auth"]
  API --> PAY["Stripe Payments"]
  UI --> CDN["Vercel Edge"]
  classDef frontend fill:#251b3e,stroke:#8863ce,color:#e6d9ff,stroke-width:1px,rx:9,ry:9
  classDef backend fill:#172a31,stroke:#3d8e9e,color:#c0eff4,stroke-width:1px,rx:9,ry:9
  classDef external fill:#202026,stroke:#454550,color:#d4d4dc,stroke-width:1px,rx:9,ry:9
  class UI frontend
  class API,DB backend
  class AUTH,PAY,CDN external`;

export const demoReadme = `# Storefront

A modern commerce starter, built with **Next.js**, **TypeScript**, and **PostgreSQL**. This is an illustrative README for CodeLens's fictional demo repository.

## Overview

Storefront brings product discovery, account management, and checkout into one full-stack application. The App Router renders the storefront, server routes handle commerce operations, and Prisma manages database access.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js · React · Tailwind CSS |
| Backend | Next.js API Routes |
| Database | PostgreSQL · Prisma |
| Authentication | Clerk |
| Payments | Stripe |

## Getting started

\`\`\`bash
npm install
cp .env.example .env.local
npx prisma generate
npm run dev
\`\`\`

Supply your own database, authentication, and payment credentials before running this example project.

## Project structure

\`\`\`text
src/
  app/           # Pages, layouts, and API routes
  components/    # Storefront UI components
  lib/           # Database and service clients
prisma/
  schema.prisma  # Product and order models
\`\`\`

## Request lifecycle

1. A shopper opens a product page rendered by Next.js.
2. The server reads product data through the shared Prisma client.
3. Checkout requests validate the user session and calculate prices on the server.
4. Stripe creates the payment session; verified webhooks finalize the order.

## Contributing

Create a feature branch, verify your changes, and open a pull request with a clear description.
`;

export const coreFiles = [
  {
    path: "src/app/layout.tsx",
    label: "Application entry point",
    description:
      "The root layout wraps every route with shared providers and the storefront shell. Start here to understand how the application is composed.",
    language: "tsx",
    code: `import { ClerkProvider } from '@clerk/nextjs';
import { CartProvider } from '@/components/cart-provider';
import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <CartProvider>{children}</CartProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}`,
  },
  {
    path: "src/lib/db.ts",
    label: "Database connection",
    description:
      "Reuses a single Prisma client during development hot reloads. Centralizing database access avoids creating a new connection pool for each module.",
    language: "typescript",
    code: `import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma
  ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}`,
  },
  {
    path: "src/app/api/checkout/route.ts",
    label: "Checkout orchestration",
    description:
      "Connects authentication, trusted database prices, and payment processing. It is a useful example of the application's server boundary.",
    language: "typescript",
    code: `import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { createCheckoutSession } from '@/lib/payments';

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', {
    status: 401,
  });

  // Simplified illustration; validate the request in production.
  const { productId } = await request.json();
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
  });
  const session = await createCheckoutSession(product, userId);
  return Response.json({ url: session.url });
}`,
  },
  {
    path: "prisma/schema.prisma",
    label: "Data model",
    description:
      "Defines the persistent product catalog and the database provider. Read this file to understand which entities the application owns.",
    language: "text",
    code: `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Product {
  id          String @id @default(cuid())
  name        String
  description String
  price       Int
  stripeId    String @unique
}`,
  },
];

export const demoQuestions = [
  "How does the app connect to the database?",
  "Where should I start exploring?",
  "How does checkout work?",
];

export function getDemoAnswer(question: string) {
  if (/database|prisma|connection|postgres/i.test(question)) {
    return `In this demo, **\`src/lib/db.ts\`** exports a shared Prisma client. It stores the client on \`globalThis\` during development so hot reloads reuse it.\n\n\`\`\`typescript\nexport const db = globalForPrisma.prisma\n  ?? new PrismaClient();\n\`\`\`\n\nThe PostgreSQL connection URL comes from \`DATABASE_URL\`, referenced in \`prisma/schema.prisma\`.\n\nSources: \`src/lib/db.ts\`, \`prisma/schema.prisma\`.`;
  }
  if (/checkout|payment|stripe/i.test(question)) {
    return "The demo checkout route first checks the **Clerk session**, then fetches the product price from the database and creates a Stripe checkout session. Prices come from the server rather than the browser.\n\nSource: `src/app/api/checkout/route.ts`. This fixture is simplified; production code also needs input validation, inventory checks, and verified webhooks.";
  }
  if (/start|explor|architecture|layout/i.test(question)) {
    return "Start with **`src/app/layout.tsx`** to see the shared providers. Then read **`prisma/schema.prisma`** for the data model, **`src/lib/db.ts`** for database access, and **`src/app/api/checkout/route.ts`** for a server-side workflow.\n\nOpen the **Code tour** tab to explore these four sample files.";
  }
  return "This starter uses preset demo answers and can explain the sample **database connection**, **application entry point**, and **checkout flow**. Try one of the suggested questions.\n\nConnect repository ingestion, Pinecone retrieval, and Groq streaming in the next iteration to answer arbitrary questions about your codebase.";
}
