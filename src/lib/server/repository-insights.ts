import "server-only";
import { posix } from "node:path";
import type { AnalysisAssets, RepositoryData, SourceFile } from "../types";
import { graphToMermaid } from "./generation";
import {
  purposeFromReadme,
  runtimeEvidence,
  sourceArchitecture,
} from "./architecture-tree";

const sourceExtension =
  /\.(?:[cm]?[jt]sx?|py|java|cs|go|rs|rb|php|swift|kt|vue|svelte|sql|prisma|graphql)$/i;
const routesPath = /(?:^|\/)(?:app|pages)\/api\/|(?:^|\/)routers?\//i;
const dataPath =
  /(?:^|\/)(?:models?|schemas?|migrations?|database|db)(?:\/|\.)/i;
const entryPath =
  /(?:^|\/)(?:main|server|index|app|manage|page|layout)\.[^.\/]+$/i;
const manifestPath =
  /(?:^|\/)(?:package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile|pom\.xml|composer\.json)$/i;

function markdown(text: string) {
  return text.replace(/\s+/g, " ").replace(/[\\`*_{}[\]<>()#+!|]/g, "\\$&");
}

function sourceLink(data: RepositoryData, path: string) {
  return `[${markdown(path)}](${data.repository.url}/blob/${data.commitSha}/${path.split("/").map(encodeURIComponent).join("/")})`;
}

function describeModules(data: RepositoryData) {
  const groups = new Map<string, { paths: string[]; text: number }>();
  const readable = new Set(data.files.map((file) => file.path));
  for (const path of data.repository.paths) {
    const parent = path.includes("/") ? path.split("/")[0] : "(root)";
    const group = groups.get(parent) ?? { paths: [], text: 0 };
    group.paths.push(path);
    if (readable.has(path)) group.text++;
    groups.set(parent, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}

function signatures(data: RepositoryData, files: SourceFile[]) {
  const routes: string[] = [];
  const models = new Set<string>();
  const mlModels = new Set<string>();
  const configuration = new Set<string>();
  const services = new Map<string, string>();
  for (const file of files) {
    const code = file.content;
    for (const match of code.matchAll(
      /(?:\b(?:app|router|server)\.|@\w+\.)(get|post|put|patch|delete|options|head)\(\s*["'](\/[^"'\r\n]*)["']/gi,
    )) {
      routes.push(
        `- ${markdown(match[1].toUpperCase() + " " + match[2])} in ${sourceLink(data, file.path)}`,
      );
    }
    const nextRoute = file.path.match(
      /(?:^|\/)app\/(api\/.+)\/route\.[cm]?[jt]s$/,
    );
    if (nextRoute) {
      const route = nextRoute[1]
        .split("/")
        .filter((part) => !part.startsWith("("))
        .join("/");
      for (const match of code.matchAll(
        /\bexport\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g,
      ))
        routes.push(
          `- ${match[1]} ${markdown("/" + route)} in ${sourceLink(data, file.path)}`,
        );
    }
    for (const match of code.matchAll(
      /^\s*model\s+(\w+)\s*\{|\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)\b|\bclass\s+(\w+)\([^\n)]*\b(?:BaseModel|Model|Base|DeclarativeBase)\b[^\n)]*\)/gim,
    )) {
      models.add(
        `- ${markdown(match[1] || match[2] || match[3])} in ${sourceLink(data, file.path)}`,
      );
    }
    for (const match of code.matchAll(
      /\b(?:from_pretrained\(\s*|(?:model|model_name|model_id)\s*=\s*)["']([\w][\w./:-]{2,100})["']/g,
    )) {
      mlModels.add(`- ${markdown(match[1])} in ${sourceLink(data, file.path)}`);
    }
    for (const match of code.matchAll(
      /\b(?:process\.env\.([A-Z][A-Z0-9_]*)|(?:os\.)?(?:getenv|environ\.get)\(\s*["']([A-Z][A-Z0-9_]*)["'])/g,
    ))
      configuration.add(match[1] || match[2]);
    for (const match of code.matchAll(
      /\bhttps?:\/\/([a-z\d](?:[a-z\d.-]*[a-z\d])\.[a-z]{2,})(?=[:/?#"'\s]|$)/gi,
    )) {
      if (!services.has(match[1])) services.set(match[1], file.path);
    }
  }
  return { routes, models, mlModels, configuration, services };
}

function folderImports(files: SourceFile[]) {
  const links = new Map<
    string,
    { from: string; to: string; example: string }
  >();
  const paths = new Set(
    files.flatMap((file) => {
      const path = file.path.replace(/\.[cm]?[jt]sx?$/, "");
      return [path, path.replace(/\/index$/, "")];
    }),
  );
  const folders = new Set(
    files
      .filter((file) => file.path.includes("/"))
      .map((file) => file.path.split("/")[0]),
  );
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/.test(file.path)) continue;
    const from = file.path.split("/")[0];
    if (from === file.path) continue;
    for (const match of file.content.matchAll(
      /\b(?:from\s*|import\s+|(?:import|require)\(\s*)["'](\.{1,2}\/[^"'\r\n]+)["']/g,
    )) {
      const target = posix
        .join(posix.dirname(file.path), match[1])
        .replace(/\.[cm]?[jt]sx?$/, "");
      const to = target.split("/")[0];
      if (from !== to && folders.has(to) && paths.has(target))
        links.set(JSON.stringify([from, to]), { from, to, example: file.path });
    }
  }
  return [...links.values()];
}

export function describeRepository(data: RepositoryData): AnalysisAssets {
  const modules = describeModules(data);
  const source = data.files.filter((file) => sourceExtension.test(file.path));
  const { routes, models, mlModels, configuration, services } = signatures(
    data,
    source,
  );
  const entries = source.filter((file) => entryPath.test(file.path));
  const manifests = data.files.filter((file) => manifestPath.test(file.path));
  const imports = folderImports(source);
  const architectureTree = sourceArchitecture(data);
  const walkthrough = runtimeEvidence(source);
  const purpose =
    data.repository.description &&
    data.repository.description !== "No description provided."
      ? data.repository.description
      : purposeFromReadme(data.files);
  const components = architectureTree.filter((node) => node.children.length);
  const filesAt = (files: SourceFile[]) =>
    files.map((file) => sourceLink(data, file.path)).join(", ");
  const graph = {
    nodes: [{ id: "repo", label: data.repository.fullName.slice(0, 80) }],
    edges: [] as { from: string; to: string; label?: "imports" }[],
  };
  const groups = [
    { id: "entry", label: "Entrypoints", files: entries },
    {
      id: "routes",
      label: "API and routing",
      files: source.filter((file) => routesPath.test(file.path)),
    },
    {
      id: "data",
      label: "Models and storage",
      files: source.filter((file) => dataPath.test(file.path)),
    },
    { id: "config", label: "Dependencies and configuration", files: manifests },
  ];
  for (const group of groups) {
    if (group.files.length === 0) continue;
    graph.nodes.push({
      id: group.id,
      label: `${group.label} · ${group.files.length} files`,
    });
    graph.edges.push({ from: "repo", to: group.id });
  }
  const folderNodes = new Map<string, string>();
  for (const [name, group] of modules
    .filter(([name]) => name !== "(root)")
    .sort(([, a], [, b]) => b.text - a.text)
    .slice(0, 12)) {
    const id = `folder${graph.nodes.length}`;
    folderNodes.set(name, id);
    graph.nodes.push({
      id,
      label: `${name.slice(0, 60)}/ · ${group.paths.length} entries`,
    });
    graph.edges.push({ from: "repo", to: id });
  }
  for (const link of imports) {
    const from = folderNodes.get(link.from);
    const to = folderNodes.get(link.to);
    if (from && to && graph.edges.length < 40)
      graph.edges.push({ from, to, label: "imports" });
  }
  const scripts = manifests.flatMap((file) => {
    if (!file.path.endsWith("package.json")) return [];
    try {
      const names = Object.keys(JSON.parse(file.content).scripts ?? {});
      return names.length
        ? [
            `- ${sourceLink(data, file.path)} defines ${names.map(markdown).join(", ")}. Run a task with \`npm run <task>\` from the manifest's directory.`,
          ]
        : [];
    } catch {
      return [];
    }
  });
  const sections = [
    `# ${markdown(data.repository.fullName)}`,
    `## What this project does\n\n${purpose ? markdown(purpose) : "The inspected source exposes the components described below. The project has no clear purpose statement in its metadata or root README."}\n\nCodeLens inspected ${data.indexedFiles} text files across ${data.repository.fileCount} committed entries on ${markdown(data.repository.branch)} at commit \`${data.commitSha.slice(0, 12)}\`.`,
    ...(components.length
      ? [
          `## How the code is organized\n\n${components.map((node) => `### ${markdown(node.title)}\n\n${markdown(node.description)}`).join("\n\n")}`,
        ]
      : []),
    ...(walkthrough.length
      ? [
          `## How the application runs\n\n${walkthrough.map(({ path, text }) => `${text} See ${sourceLink(data, path)}.`).join("\n\n")}`,
        ]
      : []),
    `## Architecture and entry points\n\n${entries.length ? "Likely starting points for tracing execution: " + filesAt(entries) + "." : "Common executable entry points were not identified from the source paths."}\n\n${groups
      .filter((group) => group.id !== "entry" && group.files.length)
      .map((group) => {
        const explanations: Record<string, string> = {
          routes:
            "This is where incoming requests are matched to application operations. Start with the route definition to see which method and path to use, then follow the handler to see how it reads or changes data.",
          data: "These definitions describe the information the application works with, including the structure of records, validation rules, or how the database is accessed.",
          config:
            "These files declare the packages and tools needed to run the project. A manifest is the place to check what a component depends on and which tasks it exposes.",
        };
        return `### ${group.label}\n\n${explanations[group.id]} Start with ${filesAt(group.files.slice(0, 4))}.`;
      })
      .join(
        "\n",
      )}${imports.length ? "\n\n### Imports across top-level folders\n\n" + imports.map(({ from, to, example }) => `- **${markdown(from)}/** imports from **${markdown(to)}/**. See ${sourceLink(data, example)}.`).join("\n") : ""}`,
    `## Repository structure\n\n${modules.map(([name, group]) => `- **${markdown(name)}** has ${group.paths.length} entries, including ${group.text} inspected text files.`).join("\n") || "The commit has no tracked files."}`,
    `## Frameworks and dependencies\n\n${data.techStack.length ? data.techStack.map(markdown).join(", ") + "." : "No known framework matches were found in the dependency manifests."}${manifests.length ? "\n\nDependency declarations: " + filesAt(manifests) + "." : ""}`,
    `## APIs and integrations\n\n${routes.join("\n") || "No HTTP handlers matched the route patterns used for this report."}${services.size ? "\n\nHostnames referenced by application source:\n\n" + [...services].map(([host, path]) => `- ${markdown(host)} in ${sourceLink(data, path)}`).join("\n") : ""}`,
    `## Models and storage\n\n${[...models].join("\n") || "No model or table declarations matched the schema patterns used for this report."}${mlModels.size ? "\n\n### Model identifiers referenced by source\n\n" + [...mlModels].join("\n") : ""}`,
    `## Local tasks and configuration\n\n${scripts.join("\n") || "No npm tasks were detected in the inspected manifests."}${
      configuration.size
        ? "\n\nEnvironment variables referenced by source: " +
          [...configuration]
            .sort()
            .map((name) => `\`${name}\``)
            .join(", ") +
          "."
        : ""
    }`,
  ];
  return {
    readme: sections.join("\n\n"),
    architecture: graphToMermaid(graph),
    architectureTree,
    flows: imports.map(({ from, to, example }) => ({
      from: from + "/",
      to: to + "/",
      description:
        from +
        " imports code from " +
        to +
        ". See " +
        example +
        " for a source example.",
    })),
    coreFiles: data.coreFiles,
    generatedBy: null,
    reviewFindings: [],
  };
}
