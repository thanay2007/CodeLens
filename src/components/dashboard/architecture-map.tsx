"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ArchitectureMap({
  expanded = false,
  source,
  description,
}: {
  expanded?: boolean;
  source: string;
  description: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    async function render() {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "#101015",
            primaryColor: "#251b3e",
            primaryTextColor: "#e4e4e7",
            primaryBorderColor: "#8863ce",
            lineColor: "#5a4a79",
            fontFamily: "ui-monospace, monospace",
            fontSize: "12px",
            edgeLabelBackground: "#101015",
          },
          flowchart: {
            htmlLabels: false,
            curve: "basis",
            nodeSpacing: 38,
            rankSpacing: 50,
            padding: 18,
            useMaxWidth: true,
          },
        });
        const result = await mermaid.render(`architecture-${id}`, source);
        if (!cancelled && container.current) {
          // Mermaid's strict mode sanitizes generated SVG; never render model HTML.
          container.current.innerHTML = result.svg;
          setStatus("ready");
          result.bindFunctions?.(container.current);
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  return (
    <div
      className={`diagram-grid relative flex flex-col overflow-hidden ${expanded ? "min-h-[480px]" : "min-h-[264px]"}`}
    >
      <div className="absolute left-5 top-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
        <span className="size-1.5 rounded-full bg-emerald-400" /> System
        overview <span className="ml-1 text-zinc-600">/</span>{" "}
        <span>Source relationships</span>
      </div>
      {status === "loading" && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-zinc-400"
        >
          <LoaderCircle className="size-4 animate-spin" /> Building architecture
          map…
        </div>
      )}
      {status === "error" && (
        <div
          role="alert"
          className="m-auto flex max-w-sm items-start gap-2 p-8 text-sm text-amber-300"
        >
          <AlertCircle className="size-5 shrink-0" />
          <span>
            The diagram could not render. Use “Export Mermaid” to inspect the
            source.
          </span>
        </div>
      )}
      <div className="flex flex-1 items-center justify-center overflow-auto px-6 pb-9 pt-12">
        <div
          ref={container}
          role="img"
          aria-label={description}
          className={`mermaid-diagram w-full transition-transform duration-200 ${status !== "ready" ? "invisible" : ""}`}
          style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
        />
      </div>
      <div className="absolute bottom-3 right-4 flex rounded-lg border border-white/8 bg-[#141419] p-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Zoom out"
          disabled={zoom <= 0.7}
          onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
        >
          <Minus className="!size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Reset zoom"
          onClick={() => setZoom(1)}
        >
          <RotateCcw className="!size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Zoom in"
          disabled={zoom >= 1.6}
          onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
        >
          <Plus className="!size-3" />
        </Button>
      </div>
    </div>
  );
}
