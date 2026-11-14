"use client";

import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Network,
} from "lucide-react";
import type { ArchitectureFlow, ArchitectureNode } from "@/lib/types";

export function ArchitectureExplorer({
  nodes,
  flows = [],
  repository,
  openFile,
}: {
  nodes: ArchitectureNode[];
  flows?: ArchitectureFlow[];
  repository: string;
  openFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(new Set<string>());
  const [selectedId, setSelectedId] = useState<string>();
  const byId = new Map<string, ArchitectureNode>();
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop()!;
    byId.set(node.id, node);
    pending.push(...node.children);
  }
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const related = selected
    ? flows.filter(
        (flow) => flow.from === selected.id || flow.to === selected.id,
      )
    : flows;
  const structure = (branches: ArchitectureNode[]) => (
    <ul className="ml-4 space-y-3 border-l border-violet-400/25 pl-5">
      {branches.map((node) => {
        const expandable = node.children.length > 0;
        const open = expanded.has(node.id);
        const chosen = selected?.id === node.id;
        return (
          <li className="relative" key={node.id}>
            <span
              aria-hidden="true"
              className="absolute -left-5 top-5 w-5 border-t border-violet-400/30"
            />
            <button
              type="button"
              aria-expanded={expandable ? open : undefined}
              aria-current={chosen ? "true" : undefined}
              onClick={() => {
                setSelectedId(node.id);
                if (expandable)
                  setExpanded((before) => {
                    const next = new Set(before);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  });
              }}
              className={
                "flex max-w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition " +
                (chosen
                  ? "border-violet-400/65 bg-[#291f42] text-violet-100"
                  : "border-white/10 bg-[#191722] text-zinc-200 hover:border-violet-400/45")
              }
            >
              {expandable ? (
                open ? (
                  <ChevronDown size={15} className="shrink-0 text-violet-300" />
                ) : (
                  <ChevronRight
                    size={15}
                    className="shrink-0 text-violet-300"
                  />
                )
              ) : (
                <span className="mx-1 size-1.5 shrink-0 rounded-full bg-cyan-300/75" />
              )}
              <span className="break-words">{node.title}</span>
            </button>
            {open && <div className="pt-3">{structure(node.children)}</div>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div>
      <p className="border-b border-white/8 px-5 py-3 text-xs leading-5 text-zinc-400">
        Click a node to expand its branches and see what it does.
      </p>
      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <nav
          aria-label="Architecture branches"
          className="diagram-grid max-h-[65vh] overflow-auto p-5 sm:p-6"
        >
          <div className="mb-4 flex w-fit max-w-full items-center gap-2.5 rounded-lg border border-violet-300/30 bg-[#261c3e] px-3 py-2.5 text-sm font-medium text-violet-100">
            <Network size={16} className="shrink-0" />{" "}
            <span className="break-all">{repository}</span>
          </div>
          {structure(nodes)}
        </nav>
        <aside
          aria-label="Architecture details"
          className="max-h-[65vh] space-y-5 overflow-auto border-t border-white/8 p-5 lg:border-l lg:border-t-0 sm:p-6"
        >
          {selected ? (
            <>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  {selected.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {selected.description}
                </p>
              </div>
              {!!selected.paths.length && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-zinc-300">
                    Source files
                  </h4>
                  {selected.paths.map((path) => (
                    <button
                      key={path}
                      onClick={() => openFile(path)}
                      className="flex max-w-full items-center gap-2 text-left text-xs text-violet-300 hover:underline"
                    >
                      <FileCode2 size={14} className="shrink-0" />
                      <span className="break-all">{path}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-zinc-100">
                Main components
              </h3>
              {nodes
                .filter((node) => node.children.length)
                .slice(0, 5)
                .map((node) => (
                  <div key={node.id}>
                    <p className="text-sm font-medium text-zinc-200">
                      {node.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">
                      {node.description}
                    </p>
                  </div>
                ))}
            </div>
          )}
          {!!related.length && (
            <div className="space-y-3 border-t border-white/8 pt-4">
              <h4 className="text-xs font-semibold text-zinc-300">
                How components connect
              </h4>
              {related.slice(0, 10).map((flow, index) => (
                <div key={flow.from + flow.to + index}>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-cyan-200">
                    {byId.get(flow.from)?.title ?? flow.from}
                    <ArrowRight size={12} />
                    {byId.get(flow.to)?.title ?? flow.to}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    {flow.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
