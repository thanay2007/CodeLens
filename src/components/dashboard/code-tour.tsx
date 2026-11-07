"use client";

import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  FileCode2,
  Lightbulb,
} from "lucide-react";
import { coreFiles } from "@/lib/demo";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "./markdown";

export function CodeTour({ initialFile = 0 }: { initialFile?: number }) {
  const [selected, setSelected] = useState(initialFile);
  const [copyStatus, setCopyStatus] = useState("");
  const file = coreFiles[selected];
  async function copy() {
    try {
      await navigator.clipboard.writeText(file.code);
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
          <h2>Follow the code</h2>
        </div>
        <span className="text-xs text-zinc-500">
          {selected + 1} of {coreFiles.length} core files · Sample
        </span>
      </div>
      <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav
          aria-label="Core files"
          className="space-y-1 border-b border-white/8 bg-white/[0.01] p-3 lg:border-b-0 lg:border-r"
        >
          {coreFiles.map((f, index) => (
            <button
              key={f.path}
              onClick={() => {
                setSelected(index);
                setCopyStatus("");
              }}
              aria-current={selected === index ? "step" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition ${selected === index ? "bg-violet-500/10 text-violet-300" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"}`}
            >
              <FileCode2 size={16} className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate font-mono text-[11px]">
                  {f.path.split("/").pop()}
                </span>
                <span className="mt-1 block text-[10px] text-zinc-500">
                  {f.label}
                </span>
              </span>
              <span className="ml-auto text-[10px] opacity-40">
                0{index + 1}
              </span>
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2 border-b border-white/8 bg-[#141419] px-5 py-3">
            <span className="truncate font-mono text-xs text-zinc-400">
              {file.path}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={copy}
              aria-label="Copy file code"
            >
              {copyStatus === "Copied" ? <Check /> : <Copy />}
              <span className="hidden sm:inline">{copyStatus || "Copy"}</span>
            </Button>
          </div>
          <div className="overflow-x-auto">
            <CodeBlock language={file.language} code={file.code} />
          </div>
          <div className="flex items-start gap-3 border-t border-white/8 bg-violet-500/[0.035] p-5">
            <Lightbulb size={18} className="mt-0.5 shrink-0 text-violet-400" />
            <div>
              <h3 className="text-xs font-medium text-violet-200">
                Why this file matters
              </h3>
              <p className="mt-2 text-xs leading-6 text-zinc-400">
                {file.description}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
            <span className="text-[11px] text-zinc-500">
              Illustrative code from the demo repository
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={selected === coreFiles.length - 1}
              onClick={() => {
                setSelected((s) => s + 1);
                setCopyStatus("");
              }}
            >
              Next file
              <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
