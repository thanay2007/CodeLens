import { expect, test } from "@playwright/test";

test("dashboard hydrates, reloads and opens client features without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Analyze a repository" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Public GitHub repository URL" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Repository views" }),
    ).toHaveCount(0);
    await expect(page.getByText("acme/storefront")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ask CodeLens" }),
    ).toHaveCount(0);
  }

  expect(errors).toEqual([]);
});

test("repository views expand nested architecture, highlight source, and remove deleted history", async ({
  page,
}) => {
  const sha = "a".repeat(40);
  const url = "https://github.com/acme/service";
  const repo = {
    id: "service",
    url,
    name: "acme/service",
    status: "ready",
    progress: 100,
    stage: "Ready",
    createdAt: 1,
  };
  let deleted = false;
  await page.route("**/api/repositories**", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (request.method() === "DELETE" && target.pathname.endsWith("/service")) {
      deleted = true;
      return route.fulfill({ json: { deleted: true } });
    }
    if (target.pathname.endsWith("/file")) {
      expect(target.searchParams.get("path")).toBe("src/api/main.py");
      return route.fulfill({
        json: {
          path: "src/api/main.py",
          content:
            "from fastapi import FastAPI\napp = FastAPI()\ndef handler(value: int) -> str:\n    return 'example'",
          language: "python",
          lines: 4,
        },
      });
    }
    if (target.pathname.endsWith("/service")) {
      return route.fulfill({
        json: {
          ...repo,
          data: {
            repository: {
              url,
              fileCount: 2,
              truncated: false,
              paths: ["src/api/main.py", "assets/logo.png"],
              entries: [
                { path: "src/api/main.py", kind: "file", preview: "text" },
                { path: "assets/logo.png", kind: "file", preview: "binary" },
              ],
            },
            commitSha: sha,
            files: [],
            coreFiles: [],
            languages: { typescript: 1 },
            indexedFiles: 1,
            techStack: [],
            findings: [],
            healthScore: 100,
            warnings: [],
            assets: {
              readme:
                "# Service internals\n\nThis service exposes an HTTP endpoint.",
              architecture: "flowchart LR\n  a[HTTP] --> b[Handler]",
              architectureTree: [
                {
                  id: "backend",
                  title: "Application server",
                  description:
                    "Receives requests and passes them to API handlers.",
                  paths: [],
                  children: [
                    {
                      id: "api",
                      title: "HTTP routes",
                      description:
                        "Routes map URLs to the operations the application supports.",
                      paths: [],
                      children: [
                        {
                          id: "handler",
                          title: "Request handler",
                          description:
                            "Validates the input and returns a response.",
                          paths: ["src/api/main.py"],
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
              generatedBy: null,
              coreFiles: [],
            },
          },
        },
      });
    }
    return route.fulfill({ json: { repositories: deleted ? [] : [repo] } });
  });
  await page.goto("/");
  const workspace = page.getByRole("navigation", { name: "Main navigation" });
  await expect(workspace.getByRole("button")).toHaveText(["Home"]);
  await page.getByRole("button", { name: /acme\/service ready/ }).click();
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  await expect(
    page.getByText("Click a node to expand", { exact: false }),
  ).toBeVisible();
  const branches = page.getByRole("navigation", {
    name: "Architecture branches",
  });
  await expect(
    branches.getByRole("button", { name: "HTTP routes" }),
  ).toHaveCount(0);
  await branches.getByRole("button", { name: "Application server" }).click();
  await branches.getByRole("button", { name: "HTTP routes" }).click();
  await branches.getByRole("button", { name: "Request handler" }).click();
  await expect(
    page.getByText("Validates the input and returns a response."),
  ).toBeVisible();
  await page.getByRole("button", { name: "src/api/main.py" }).click();
  await expect(
    page.getByRole("button", { name: "Copy file code" }),
  ).toBeVisible();
  await expect(page.locator("pre")).toContainText("return");
  await expect(
    page.locator("pre span").filter({ hasText: /^return$/ }),
  ).toHaveCSS("color", "rgb(197, 134, 192)");
  await page
    .getByRole("button", { name: "Documentation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Service internals" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Deploy guide" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText(/Code health|Inspection score|Signals to investigate/),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Code tour 2" }).click();
  const tree = page.getByRole("navigation", { name: "Repository file tree" });
  await expect(
    page.getByRole("button", { name: "Copy file code" }),
  ).toBeVisible();
  await tree.getByText("assets", { exact: true }).click();
  await tree.getByRole("button", { name: "logo.png" }).click();
  await expect(
    page.getByText("This file has no UTF-8 text preview."),
  ).toBeVisible();
  await workspace.getByRole("button", { name: "Home" }).click();
  await expect(
    page.getByRole("heading", { name: "Analyze a repository" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete acme/service from history" })
    .click();
  await page
    .getByRole("button", { name: "Delete from history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(deleted).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Delete acme/service from history" }),
  ).toHaveCount(0);
});
