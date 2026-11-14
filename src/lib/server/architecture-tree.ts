import "server-only";
import type { ArchitectureNode, RepositoryData, SourceFile } from "../types";

const roles: [RegExp, string, string][] = [
  [
    /^(frontend|web|client|ui|mobile)$/i,
    "User interface",
    "This part contains the screens and controls people interact with. Its entry point starts the interface, and its pages and components determine what users can see and do.",
  ],
  [
    /^(backend|server)$/i,
    "Application server",
    "The server runs the application logic. Follow its entry point to see how it starts, then expand its API, processing, and storage modules to trace how work is done.",
  ],
  [
    /^(api|routers?|routes?|endpoints?|controllers?)$/i,
    "API and routing",
    "These modules receive requests and direct them to the code that handles each operation. Expand a route file to find the methods and paths it declares.",
  ],
  [
    /^(models?|schemas?|migrations?|db|database)$/i,
    "Models and storage",
    "These files define how information is represented, checked, or stored. Models describe the data, while migrations and database modules describe how it is kept.",
  ],
  [
    /^(services?|workers?|jobs?|tasks?|pipeline|pipelines?)$/i,
    "Processing and services",
    "These modules carry out application operations. Their functions and classes show how work has been divided into reusable steps.",
  ],
  [
    /^(ml|nlp|inference|training|predictors?)$/i,
    "Machine learning",
    "This part contains code related to preparing data, loading models, training, or making predictions. Expand the modules to see the specific stages present.",
  ],
  [
    /^(adapters?|integrations?|providers?|connectors?|osint)$/i,
    "External integrations",
    "These modules are where the application exchanges information with other systems or collects data from outside the repository.",
  ],
  [
    /^(pages|components|views|screens)$/i,
    "Screens and interface components",
    "These files build the individual views and reusable controls that make up the interface.",
  ],
  [
    /^(auth|security|middleware)$/i,
    "Authentication and request checks",
    "These modules contain checks that run around requests or operations, including rules for who can use them.",
  ],
  [
    /^(tests?|__tests__|specs?)$/i,
    "Tests",
    "These files describe scenarios the project checks automatically and show how its features are expected to behave.",
  ],
  [
    /^(scripts?|tools?)$/i,
    "Project tools",
    "These are standalone commands for working with the project, such as preparation, setup, or maintenance tasks.",
  ],
];

function role(name: string) {
  return roles.find(([pattern]) => pattern.test(name));
}

export function sourceSymbols(file: SourceFile) {
  const symbols: { title: string; description: string }[] = [];
  for (const match of file.content.matchAll(
    /(?:@[\w.]+\.|\b(?:app|router|server)\.)(get|post|put|patch|delete|options|head)\(\s*["'](\/[^"'\r\n]*)["']/gi,
  )) {
    const method = match[1].toUpperCase();
    const action =
      {
        GET: "reads information",
        POST: "submits information or starts an operation",
        PUT: "replaces information",
        PATCH: "updates information",
        DELETE: "removes information",
      }[method] ?? "handles a request";
    symbols.push({
      title: method + " " + match[2],
      description:
        "This HTTP handler " +
        action +
        " for " +
        match[2] +
        ". Read its handler body to see how the request is checked and what it returns.",
    });
  }
  for (const match of file.content.matchAll(
    /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(def|function|class|model|interface|type)\s+([A-Za-z][\w]*)[^\n]*\n(?:\s*(?:"""|''')([^\n"']+))?/gm,
  )) {
    const label = match[2]
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .toLowerCase();
    symbols.push({
      title: match[2],
      description:
        match[3]?.trim().slice(0, 320) ||
        (match[1] === "class" ||
        match[1] === "model" ||
        match[1] === "interface" ||
        match[1] === "type"
          ? "Defines the structure or behavior for " + label + "."
          : "Runs the " + label + " operation."),
    });
  }
  return symbols;
}

export function sourceArchitecture(data: RepositoryData) {
  type Folder = { directories: Map<string, Folder>; files: SourceFile[] };
  const root: Folder = { directories: new Map(), files: [] };
  const files = data.files.length
    ? data.files
    : (data.repository.entries ?? [])
        .filter((entry) => entry.kind === "file" && entry.preview === "text")
        .map((entry) => ({
          path: entry.path,
          content: "",
          lines: 0,
          language: "text",
        }));
  for (const file of files) {
    if (
      !/\.(?:[cm]?[jt]sx?|py|go|rs|java|cs|rb|php|swift|kt|vue|svelte|sql|prisma|graphql)$/i.test(
        file.path,
      )
    )
      continue;
    if (
      /(?:^|\/)(?:node_modules|vendor|dist|build|coverage)(?:\/|$)|\.min\.js$/i.test(
        file.path,
      )
    )
      continue;
    let current = root;
    for (const name of file.path.split("/").slice(0, -1)) {
      if (!current.directories.has(name))
        current.directories.set(name, { directories: new Map(), files: [] });
      current = current.directories.get(name)!;
    }
    current.files.push(file);
  }
  function fileNode(file: SourceFile): ArchitectureNode {
    const name = file.path.split("/").at(-1)!;
    const symbols = sourceSymbols(file);
    const runtime = runtimeEvidence([file]);
    const description =
      /^\s*(?:"""|''')([^\n"']+)/.exec(file.content)?.[1]?.trim() ||
      runtime[0]?.text ||
      (symbols.length
        ? "This module defines " +
          symbols
            .slice(0, 4)
            .map((symbol) => symbol.title)
            .join(", ") +
          ". Expand it to inspect its operations."
        : "Open the source to inspect the declaration or implementation in this module.");
    return {
      id: file.path,
      title: name,
      description,
      paths: [file.path],
      children: symbols.map((symbol, index) => ({
        ...symbol,
        id: file.path + "#" + index,
        paths: [file.path],
        children: [],
      })),
    };
  }
  function children(folder: Folder, path: string): ArchitectureNode[] {
    return [
      ...[...folder.directories]
        .sort(
          ([a], [b]) =>
            Number(Boolean(role(b))) - Number(Boolean(role(a))) ||
            a.localeCompare(b),
        )
        .map(([name, child]) => {
          const next = path + name + "/";
          const matched = role(name);
          const nested = children(child, next);
          return {
            id: next,
            title: matched ? matched[1] + " · " + name : name,
            description:
              matched?.[2] ||
              "This module groups " +
                nested
                  .slice(0, 5)
                  .map((node) => node.title)
                  .join(", ") +
                ".",
            paths: [],
            children: nested,
          };
        }),
      ...folder.files
        .sort((a, b) => a.path.localeCompare(b.path))
        .map(fileNode),
    ];
  }
  return children(root, "");
}

export function purposeFromReadme(files: SourceFile[]) {
  const readme = files.find((file) =>
    /^readme\.(md|markdown|rst|txt)$/i.test(file.path),
  );
  if (!readme) return "";
  const lines = readme.content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(div|p|span)(?:\s[^>]*)?>|<\/(?:div|p|span)>/gi, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:#|!|\[!\[|<|---|>|[\x60~]{3})/.test(line));
  const intro = lines.find(
    (line) => /^[*\p{L}]/u.test(line) && line.length >= 30,
  );
  if (!intro) return "";
  const paragraph = readme.content
    .split(/\r?\n\s*\r?\n/)
    .find((block) => block.includes(intro) && !/^\s*#/.test(block));
  return (paragraph || intro)
    .replace(/<[^>]+>|[*_\x60]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 360);
}

export function runtimeEvidence(files: SourceFile[]) {
  const patterns: { match: RegExp; text: string }[] = [
    {
      match: /\bcreateRoot\s*\(|\bReactDOM\.render\s*\(/,
      text: "React mounts the user interface into the browser. This is the point where the page turns into an interactive application.",
    },
    {
      match: /\bFastAPI\s*\(/,
      text: "FastAPI creates the HTTP application. Requests enter here and are passed to route handlers. The startup code also shows what the server initializes before it accepts requests.",
    },
    {
      match: /\binclude_router\s*\(/,
      text: "The server attaches routers to its application. Routers collect related operations, such as reading records or submitting updates, under a common part of the API.",
    },
    {
      match: /\b(?:AsyncIOScheduler|BackgroundScheduler)\s*\(/,
      text: "A scheduler runs application jobs on a timer. This lets work continue in the background between requests from the browser.",
    },
    {
      match: /\b(?:create_engine|create_async_engine)\s*\(/,
      text: "The database engine connects the application's Python code to its database. The connection settings and session setup explain how handlers and background jobs can load or save records.",
    },
    {
      match:
        /\b(?:AutoModel\w*|AutoTokenizer|SentenceTransformer)\.(?:from_pretrained)\s*\(/,
      text: "The application loads a pre-trained language model or tokenizer. This is where existing model weights or text preparation rules enter the code, before the application uses them for predictions or training.",
    },
    {
      match: /\baxios\.create\s*\(|\bnew\s+ApolloClient\s*\(/,
      text: "This API client bundles the connection settings for requests to another part of the system. Other modules can reuse it instead of configuring the server address and request behavior separately.",
    },
  ];
  return patterns.flatMap(({ match, text }) => {
    const file = files.find((file) => match.test(file.content));
    return file ? [{ path: file.path, text }] : [];
  });
}
