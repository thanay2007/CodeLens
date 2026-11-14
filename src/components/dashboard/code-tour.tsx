"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  FileCode2,
  Folder,
} from "lucide-react";
import type { CoreFile, RepositoryEntry, SourceFile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "./markdown";

type Branch = {
  name: string;
  path: string;
  children: Map<string, Branch>;
  entry?: RepositoryEntry;
};

function buildTree(entries: RepositoryEntry[]) {
  const root: Branch = { name: "", path: "", children: new Map() };
  for (const entry of entries) {
    let parent = root;
    for (const name of entry.path.split("/")) {
      let branch = parent.children.get(name);
      if (!branch) {
        branch = {
          name,
          path: parent.path ? parent.path + "/" + name : name,
          children: new Map(),
        };
        parent.children.set(name, branch);
      }
      parent = branch;
    }
    parent.entry = entry;
  }
  return root.children;
}

function TreeList({
  children,
  selected,
  initialPath,
  onSelect,
}: {
  children: Map<string, Branch>;
  selected?: string;
  initialPath?: string;
  onSelect: (entry: RepositoryEntry) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {[...children.values()]
        .sort(
          (a, b) =>
            Number(Boolean(a.entry)) - Number(Boolean(b.entry)) ||
            a.name.localeCompare(b.name),
        )
        .map((branch) => (
          <li key={branch.path}>
            {branch.entry ? (
              <button
                type="button"
                aria-current={selected === branch.path ? "true" : undefined}
                onClick={() => onSelect(branch.entry!)}
                title={branch.path}
                className={
                  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5 " +
                  (selected === branch.path
                    ? "bg-violet-500/15 text-violet-200"
                    : "text-zinc-400")
                }
              >
                <FileCode2 size={14} className="ml-4 shrink-0" />
                <span className="truncate">{branch.name}</span>
              </button>
            ) : (
              <details
                open={initialPath?.startsWith(branch.path + "/") || undefined}
                className="group/folder"
              >
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-zinc-300 hover:bg-white/5 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    size={12}
                    className="shrink-0 transition-transform group-open/folder:rotate-90"
                  />
                  <Folder size={14} className="shrink-0 text-violet-400" />
                  <span className="truncate">{branch.name}</span>
                </summary>
                <div className="ml-3 border-l border-white/10 pl-1">
                  <TreeList
                    children={branch.children}
                    selected={selected}
                    initialPath={initialPath}
                    onSelect={onSelect}
                  />
                </div>
              </details>
            )}
          </li>
        ))}
    </ul>
  );
}

const unavailable = {
  protected:
    "This path may contain credentials. Its content is excluded from previews.",
  binary: "This file has no UTF-8 text preview.",
  symlink: "This entry is a symbolic link.",
  submodule: "This entry points to a separate repository at a pinned commit.",
  legacy: "This file was outside the previous scan. Reanalyze to inspect it.",
};

export function CodeTour({
  initialPath,
  entries,
  highlights,
  repositoryId,
  commitUrl,
  commitSha,
  complete,
}: {
  initialPath?: string;
  entries: RepositoryEntry[];
  highlights: CoreFile[];
  repositoryId: string | null;
  commitUrl?: string;
  commitSha?: string;
  complete: boolean;
}) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [path, setPath] = useState(
    initialPath ?? highlights[0]?.path ?? entries[0]?.path,
  );
  const [result, setResult] = useState<SourceFile | null>(null);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [page, setPage] = useState(0);
  const entry = entries.find((item) => item.path === path);
  const highlight = highlights.find((item) => item.path === path);
  const code = repositoryId ? result?.content : highlight?.code;
  const lines = useMemo(() => code?.split("\n") ?? [], [code]);
  const pageSize = 1000;
  const pageCount = Math.max(1, Math.ceil(lines.length / pageSize));
  const previewable = entry?.kind === "file" && entry.preview === "text";
  const loading = Boolean(
    path && previewable && repositoryId && !result && !error,
  );

  useEffect(() => {
    if (!path || !previewable || !repositoryId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ path });
    fetch("/api/repositories/" + repositoryId + "/file?" + query, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [path, previewable, repositoryId]);

  async function copy() {
    if (code === undefined) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Clipboard unavailable");
    }
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-heading">
        <div className="flex items-center gap-2">
          <BookOpen size={17} className="text-violet-400" />
          <h2>Repository files</h2>
        </div>
        <span className="text-xs text-zinc-500">
          {entries.length.toLocaleString()} entries
        </span>
      </div>
      {!complete && (
        <p className="border-b border-white/8 px-5 py-3 text-xs text-amber-200">
          Reanalyze this repository to load its complete file tree.
        </p>
      )}
      <div className="grid lg:grid-cols-[minmax(230px,28%)_minmax(0,1fr)]">
        <nav
          aria-label="Repository file tree"
          className="max-h-[42vh] overflow-auto border-b border-white/8 bg-white/[0.01] p-3 font-mono text-xs lg:max-h-[70vh] lg:border-b-0 lg:border-r"
        >
          <TreeList
            children={tree}
            selected={path}
            initialPath={initialPath ?? highlights[0]?.path}
            onSelect={(item) => {
              if (item.path === path) return;
              setResult(null);
              setError("");
              setCopyStatus("");
              setPage(0);
              setPath(item.path);
            }}
          />
        </nav>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-[#141419] px-5 py-3">
            <span className="flex-1 break-all font-mono text-xs text-zinc-400">
              {path}
            </span>
            {path && commitUrl && (
              <a
                href={
                  commitUrl +
                  "/blob/" +
                  commitSha +
                  "/" +
                  path.split("/").map(encodeURIComponent).join("/")
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-100"
              >
                View on GitHub <ArrowUpRight size={13} />
              </a>
            )}
            {code !== undefined && (
              <Button
                variant="ghost"
                size="sm"
                onClick={copy}
                aria-label="Copy file code"
              >
                {copyStatus === "Copied" ? <Check /> : <Copy />}
                {copyStatus || "Copy"}
              </Button>
            )}
          </div>
          {code !== undefined ? (
            <div className="max-h-[60vh] overflow-auto">
              {pageCount > 1 && (
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/8 bg-[#222] px-4 py-2 text-xs text-zinc-300">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous lines
                  </Button>
                  <span>
                    {page * pageSize + 1}–
                    {Math.min((page + 1) * pageSize, lines.length)} of{" "}
                    {lines.length}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page + 1 >= pageCount}
                    onClick={() => setPage(page + 1)}
                  >
                    Next lines
                  </Button>
                </div>
              )}
              <CodeBlock
                code={lines
                  .slice(page * pageSize, (page + 1) * pageSize)
                  .join("\n")}
                language={result?.language ?? highlight?.language}
                startLine={page * pageSize + 1}
              />
            </div>
          ) : (
            <p
              role={error ? "alert" : "status"}
              className="p-6 text-sm leading-6 text-zinc-400"
            >
              {error ||
                (loading
                  ? "Loading source…"
                  : !entry
                    ? "No files at this commit."
                    : entry.kind === "file"
                      ? unavailable[
                          entry.preview === "protected"
                            ? "protected"
                            : entry.preview === "binary"
                              ? "binary"
                              : "legacy"
                        ]
                      : unavailable[entry.kind])}
            </p>
          )}
          {highlight?.description && (
            <p className="border-t border-white/8 p-5 text-xs leading-6 text-zinc-400">
              {highlight.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
