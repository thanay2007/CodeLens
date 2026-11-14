"use client";

import dynamic from "next/dynamic";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowRight,
  Boxes,
  Braces,
  Check,
  CircleAlert,
  ChevronRight,
  Code2,
  FileCode2,
  FileText,
  GitBranch,
  Home,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Spotlight } from "@/components/ui/spotlight";
import { Github } from "@/components/ui/github-icon";
import { cn, downloadText } from "@/lib/utils";
import type {
  RepositoryData,
  RepositoryEntry,
  RepositorySummary,
  ServiceConfiguration,
} from "@/lib/types";
import { ChatDrawer } from "./chat-drawer";
import { ArchitectureExplorer } from "./architecture-explorer";
import { CodeTour } from "./code-tour";
import { Markdown } from "./markdown";

const ArchitectureMap = dynamic(() => import("./architecture-map"), {
  ssr: false,
  loading: () => (
    <div className="diagram-grid flex min-h-64 items-center justify-center gap-2 text-xs text-zinc-500">
      <LoaderCircle className="size-4 animate-spin" />
      Loading diagram…
    </div>
  ),
});
type Section = "overview" | "architecture" | "documentation" | "tour";
type View = "search" | "mobile" | "delete" | null;
type Detail = RepositorySummary & { data: RepositoryData | null };
const navigation: { id: Section; title: string; icon: LucideIcon }[] = [
  { id: "overview", title: "Overview", icon: LayoutDashboard },
  { id: "architecture", title: "Architecture", icon: Network },
  { id: "documentation", title: "Documentation", icon: FileText },
  { id: "tour", title: "Code tour", icon: Braces },
];
const defaults: ServiceConfiguration = {
  clerk: false,
  gemini: false,
  groq: false,
  pinecone: false,
  local: true,
  database: "sqlite",
};

function ClerkAccount({
  onIdentity,
}: {
  onIdentity: (signedIn: boolean) => void;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  useEffect(() => {
    if (isLoaded) onIdentity(Boolean(isSignedIn));
  }, [isLoaded, isSignedIn, user?.id, onIdentity]);
  return !isLoaded ? (
    <span className="size-8 animate-pulse rounded-full bg-zinc-800" />
  ) : isSignedIn ? (
    <UserButton />
  ) : (
    <SignInButton mode="modal">
      <Button variant="outline" size="sm">
        Sign in
      </Button>
    </SignInButton>
  );
}
function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="logo-mark">
        <Code2 size={21} />
      </span>
      <span className="text-[21px] font-semibold tracking-[-0.9px]">
        Code<span className="text-violet-300">Lens</span>
        <span className="ml-1.5 align-top text-[9px] font-medium tracking-normal text-zinc-500">
          BETA
        </span>
      </span>
    </span>
  );
}
function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      <div className="panel-heading">
        <div className="flex items-center gap-2.5">
          <Icon className="size-4 text-zinc-400" />
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center p-8 text-center">
      <Sparkles className="mb-4 size-7 text-violet-400/60" />
      <h3 className="text-sm text-zinc-200">{title}</h3>
      <p className="mt-2 max-w-md text-xs leading-6 text-zinc-500">{text}</p>
    </div>
  );
}
async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, init),
    data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The request could not finish.");
  return data;
}

export function Dashboard({ clerkEnabled }: { clerkEnabled: boolean }) {
  const [section, setSection] = useState<Section>("overview"),
    [view, setView] = useState<View>(null);
  const [config, setConfig] = useState(defaults),
    [history, setHistory] = useState<RepositorySummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null),
    [active, setActive] = useState<Detail | null>(null);
  const [repoUrl, setRepoUrl] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [chat, setChat] = useState(false),
    [search, setSearch] = useState(""),
    [tourPath, setTourPath] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<RepositorySummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [revision, setRevision] = useState(0);
  const [canLoadHistory, setCanLoadHistory] = useState(!clerkEnabled);
  const identityVersion = useRef(0);
  const identityChanged = useCallback((signedIn: boolean) => {
    identityVersion.current++;
    setActive(null);
    setSelected(null);
    setHistory([]);
    setChat(false);
    setView(null);
    setDeleteTarget(null);
    setError("");
    setCanLoadHistory(signedIn);
    setRevision((value) => value + 1);
  }, []);

  const refreshHistory = useCallback(async (signal?: AbortSignal) => {
    const version = identityVersion.current;
    const result = await jsonFetch("/api/repositories", { signal });
    if (!signal?.aborted && version === identityVersion.current)
      setHistory(result.repositories);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    jsonFetch("/api/workspace", { signal: controller.signal })
      .then(setConfig)
      .catch(() => undefined);
    if (canLoadHistory)
      refreshHistory(controller.signal)
        .then(() => setError(""))
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        });
    return () => controller.abort();
  }, [revision, refreshHistory, canLoadHistory]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const repo: Detail = await jsonFetch(`/api/repositories/${selected}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setActive(repo);
        if (repo.status === "processing" || repo.status === "queued")
          timer = setTimeout(poll, 1500);
        else await refreshHistory(controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message);
      }
    };
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selected, revision, refreshHistory]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setView((value) => (value === "search" ? null : "search"));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function select(id: string | null) {
    if (id !== selected) setActive(null);
    setSelected(id);
    setView(null);
    setError("");
    setSection("overview");
    setTourPath(undefined);
  }
  function navigate(id: Section) {
    setSection(id);
    setView(null);
  }
  function home() {
    select(null);
    setChat(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function analyze(url: string) {
    if (loading) return;
    setLoading(true);
    setError("");
    const version = identityVersion.current;
    try {
      const repo = await jsonFetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (version === identityVersion.current) {
        select(repo.id);
        await refreshHistory();
      }
    } catch (err) {
      if (version === identityVersion.current) setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function deleteRepository() {
    if (!deleteTarget || deleting) return;
    const id = deleteTarget.id;
    const version = identityVersion.current;
    setDeleting(true);
    setDeleteError("");
    try {
      await jsonFetch(`/api/repositories/${id}`, { method: "DELETE" });
      if (version !== identityVersion.current) return;
      if (selected === id) home();
      setHistory((items) => items.filter((item) => item.id !== id));
      setDeleteTarget(null);
      setView(null);
      setRevision((value) => value + 1);
    } catch (err) {
      if (version === identityVersion.current)
        setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  async function cancel() {
    if (!selected) return;
    try {
      await jsonFetch(`/api/repositories/${selected}/cancel`, {
        method: "POST",
      });
      setRevision((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  const data = active?.data;
  const assets = data?.assets;
  const name =
    active?.name ||
    history.find((item) => item.id === selected)?.name ||
    "Loading repository";
  const coreFiles = assets?.coreFiles || data?.coreFiles || [];
  const diagram = assets?.architecture;
  const readme = assets?.readme;
  const treeEntries =
    data?.repository.entries ??
    [
      ...new Set([
        ...(data?.repository.paths ?? []),
        ...(data?.files.map((file) => file.path) ?? []),
      ]),
    ].map((path): RepositoryEntry => ({
      path,
      kind: "file",
      preview: data?.files.some((file) => file.path === path)
        ? "text"
        : undefined,
    }));
  const inspectedLines = Object.values(data?.languages || {}).reduce(
    (total, lines) => total + lines,
    0,
  );
  const busy = Boolean(
    active && ["queued", "processing"].includes(active.status),
  );
  const techStack = data?.techStack ?? [];
  const chatReady = Boolean(
    data?.indexedFiles &&
    (config.gemini || config.groq) &&
    active?.status !== "cancelled",
  );

  function openSource(path: string) {
    setTourPath(path);
    navigate("tour");
  }

  const sidebar = (
    <>
      <div className="px-5 pb-7 pt-7">
        <Logo />
      </div>
      <div className="mx-4 mb-7 flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] p-3">
        <span className="flex size-7 items-center justify-center rounded-md bg-violet-500/10 text-xs text-violet-300">
          W
        </span>
        <span className="text-xs text-zinc-300">
          Personal workspace
          <span className="mt-1 block text-[10px] text-zinc-600">
            {config.local && !config.clerk
              ? "Local development"
              : "Your repositories"}
          </span>
        </span>
      </div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="space-y-1 px-3" aria-label="Main navigation">
        <button
          onClick={home}
          aria-current={!selected ? "page" : undefined}
          className={cn("nav-item", !selected && "nav-item-active")}
        >
          <Home size={17} />
          Home
        </button>
      </nav>
      <div className="sidebar-label mt-8">REPOSITORIES</div>
      <div className="space-y-1 px-3">
        {history.map((repo) => (
          <div
            key={repo.id}
            className={cn(
              "flex items-center rounded-lg text-zinc-500 transition hover:bg-white/5",
              selected === repo.id && "bg-violet-500/10 text-violet-200",
            )}
          >
            <button
              onClick={() => select(repo.id)}
              aria-current={selected === repo.id ? "true" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
            >
              <Github size={14} className="shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-[11px]">{repo.name}</span>
                <span className="mt-1 block text-[9px] text-zinc-500">
                  {repo.status} ·{" "}
                  {new Date(repo.createdAt).toLocaleDateString()}
                </span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="mr-1 !size-7 shrink-0 hover:text-rose-300"
              aria-label={`Delete ${repo.name} from history`}
              onClick={() => {
                setDeleteTarget(repo);
                setDeleteError("");
                setView("delete");
              }}
            >
              <Trash2 className="!size-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 border-t border-white/6 px-6 py-4 text-[10px] text-zinc-600">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        Your code, in focus<span className="ml-auto font-mono">v0.2.0</span>
      </div>
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <aside className="sidebar hidden lg:flex">{sidebar}</aside>
        <div className="main-shell">
          <header className="topbar">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setView("mobile")}
            >
              <Menu />
            </Button>
            <div className="flex min-w-0 items-center gap-2.5 text-xs">
              <span className="text-zinc-400">Workspace</span>
              {selected && (
                <>
                  <ChevronRight size={13} className="text-zinc-700" />
                  <Github size={15} className="shrink-0 text-zinc-500" />
                  <span className="truncate text-zinc-300">{name}</span>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setView("search")}
                className="search-trigger"
                aria-label="Search workspace"
              >
                <Search size={14} />
                <span className="hidden sm:inline">Search your workspace…</span>
                <kbd className="ml-4 hidden rounded border border-white/10 px-1 text-[9px] sm:inline">
                  ⌘ K
                </kbd>
              </button>
              {clerkEnabled && <ClerkAccount onIdentity={identityChanged} />}
            </div>
          </header>
          <main id="main-content" className="dashboard-content">
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="welcome-hero"
            >
              <Spotlight className="-right-[20%] -top-[150%]" />
              <div className="hero-grid" aria-hidden="true" />
              <div className="relative z-10 max-w-[700px]">
                <h1 className="text-[clamp(25px,3.1vw,40px)] font-semibold leading-[1.2] tracking-[-1.5px]">
                  Analyze a repository
                </h1>
                <p className="mt-3 text-[13px] leading-6 text-zinc-400">
                  Paste a public GitHub URL to explore its architecture,
                  documentation, and source files.
                </p>
                <form
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    analyze(repoUrl);
                  }}
                  className="repo-input-wrap mt-6"
                >
                  <Github size={19} className="ml-4 shrink-0 text-zinc-500" />
                  <input
                    type="url"
                    required
                    maxLength={300}
                    value={repoUrl}
                    onChange={(event) => setRepoUrl(event.target.value)}
                    placeholder="Paste a public GitHub repository URL…"
                    aria-label="Public GitHub repository URL"
                    className="h-12 min-w-0 flex-1 bg-transparent px-3 text-xs text-zinc-200 outline-none placeholder:text-zinc-600"
                  />
                  <Button
                    type="submit"
                    disabled={loading || !repoUrl.trim()}
                    className="mr-1.5 h-9 px-3.5 text-xs"
                  >
                    {loading ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Sparkles className="!size-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {loading ? "Starting…" : "Analyze repository"}
                    </span>
                    <ArrowRight className="!size-3.5 sm:hidden" />
                  </Button>
                </form>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
                  <ShieldCheck size={11} />
                  Public repositories · Pinned commits ·{" "}
                  {config.database === "supabase"
                    ? "Encrypted repository history"
                    : "Likely secrets redacted"}
                </p>
              </div>
              <div
                className="orbital-illustration hidden xl:block"
                aria-hidden="true"
              >
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orbit orbit-three" />
                <div className="orbit-center">
                  <Code2 size={39} strokeWidth={1.4} />
                </div>
                <span className="orbit-node node-a">
                  <Braces size={15} />
                </span>
                <span className="orbit-node node-b">
                  <Layers3 size={14} />
                </span>
                <span className="orbit-node node-c">
                  <GitBranch size={13} />
                </span>
                <span className="orbit-spark spark-a" />
                <span className="orbit-spark spark-b" />
              </div>
            </motion.section>
            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-rose-300/15 bg-rose-300/5 p-4 text-xs leading-5 text-rose-200"
              >
                <span>{error}</span>
                <button aria-label="Dismiss error" onClick={() => setError("")}>
                  <X size={14} />
                </button>
              </div>
            )}
            {selected && (
              <>
                <div className="mb-5 mt-8 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="mb-1.5 flex items-center gap-2 text-[10px] text-zinc-600">
                      <span className="size-1.5 rounded-full bg-emerald-400/80" />
                      YOUR SOURCE SNAPSHOT
                      <span className="px-1 text-zinc-700">/</span>
                      <span className="font-mono">
                        {data?.commitSha.slice(0, 7) ||
                          active?.status ||
                          "Loading"}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold tracking-[-0.6px]">
                      {section === "overview"
                        ? "Repository overview"
                        : navigation.find((item) => item.id === section)?.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!active || loading || busy}
                      onClick={() => analyze(active?.url || "")}
                    >
                      <RefreshCw className="!size-3.5" />
                      Reanalyze
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!readme}
                      onClick={() =>
                        readme && downloadText("DOCUMENTATION.md", readme)
                      }
                    >
                      <ArrowDownToLine className="!size-3.5" />
                      Export documentation
                    </Button>
                  </div>
                </div>
                {active && (
                  <div className="panel mb-5 px-5 py-4">
                    <div className="flex items-center gap-3">
                      {busy ? (
                        <LoaderCircle className="size-4 animate-spin text-violet-400" />
                      ) : active.status === "ready" ? (
                        <Check className="size-4 text-emerald-400" />
                      ) : (
                        <CircleAlert className="size-4 text-amber-300" />
                      )}
                      <span
                        role="status"
                        className="flex-1 text-xs text-zinc-300"
                      >
                        {active.stage}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {active.progress}%
                      </span>
                      {busy && (
                        <Button variant="ghost" size="sm" onClick={cancel}>
                          Cancel
                        </Button>
                      )}
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Repository analysis progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={active.progress}
                      className="mt-3 h-1 overflow-hidden rounded bg-white/5"
                    >
                      <motion.div
                        animate={{ width: `${active.progress}%` }}
                        className="h-full rounded bg-gradient-to-r from-violet-500 to-cyan-400"
                      />
                    </div>
                    {active.error && (
                      <p role="alert" className="mt-3 text-xs text-rose-300">
                        {active.error}
                      </p>
                    )}
                    {data?.warnings.map((warning) => (
                      <p
                        key={warning}
                        className="mt-2 text-[11px] leading-5 text-zinc-500"
                      >
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
                <nav aria-label="Repository views" className="repo-tabs">
                  {navigation.map(({ id, title, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => navigate(id)}
                      aria-current={section === id ? "page" : undefined}
                      className={cn(
                        "repo-tab",
                        section === id && "repo-tab-active",
                      )}
                    >
                      <Icon size={14} />
                      {title}
                      {id === "tour" && (
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-zinc-500">
                          {treeEntries.length}
                        </span>
                      )}
                      {section === id && (
                        <motion.span
                          layoutId="active-tab"
                          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-violet-400"
                        />
                      )}
                    </button>
                  ))}
                </nav>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`${section}:${selected}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="mt-6"
                  >
                    {!data ? (
                      <Empty
                        title={
                          busy
                            ? "Bringing your codebase into focus…"
                            : active?.status === "failed"
                              ? "This analysis needs another try."
                              : active?.status === "cancelled"
                                ? "Analysis cancelled."
                                : "Loading your repository…"
                        }
                        text={
                          active?.error ||
                          "The repository views will appear as source analysis progresses."
                        }
                      />
                    ) : (
                      <>
                        {section === "overview" && (
                          <>
                            <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-3">
                              {[
                                {
                                  icon: FileCode2,
                                  label: "Text files inspected",
                                  value: data.indexedFiles.toLocaleString(),
                                  note:
                                    "of " +
                                    data.repository.fileCount +
                                    " committed entries",
                                  color: "violet",
                                },
                                {
                                  icon: Code2,
                                  label: "Inspected lines",
                                  value: inspectedLines.toLocaleString(),
                                  note: "Within the source snapshot",
                                  color: "cyan",
                                },
                                {
                                  icon: Layers3,
                                  label: "Languages",
                                  value: String(
                                    Object.keys(data.languages).length,
                                  ),
                                  note:
                                    Object.entries(data.languages).sort(
                                      (a, b) => b[1] - a[1],
                                    )[0]?.[0] || "No text detected",
                                  color: "pink",
                                },
                              ].map(
                                ({ icon: Icon, label, value, note, color }) => (
                                  <div className="stat-card" key={label}>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] text-zinc-500">
                                        {label}
                                      </span>
                                      <span
                                        className={`stat-icon stat-${color}`}
                                      >
                                        <Icon size={15} />
                                      </span>
                                    </div>
                                    <div className="mt-3.5 text-[29px] font-semibold leading-none tracking-[-1px]">
                                      {value}
                                    </div>
                                    <p className="mt-2.5 text-[10px] text-zinc-600">
                                      {note}
                                    </p>
                                  </div>
                                ),
                              )}
                            </div>
                            <div className="overview-grid">
                              <Panel
                                title="Your documentation"
                                icon={FileText}
                                action={
                                  <span className="text-[9px] text-violet-300">
                                    {assets?.generatedBy ?? "Source analysis"}
                                  </span>
                                }
                              >
                                <button
                                  onClick={() => navigate("documentation")}
                                  className="group flex w-full items-start gap-4 p-5 text-left"
                                >
                                  <span className="flex h-[76px] w-14 shrink-0 items-center justify-center rounded-lg border border-violet-300/10 bg-violet-400/5 text-violet-300/70">
                                    <FileText size={26} strokeWidth={1.2} />
                                  </span>
                                  <span>
                                    <span className="font-mono text-xs text-zinc-200">
                                      Repository documentation
                                    </span>
                                    <span className="mt-2 block text-[11px] leading-5 text-zinc-500">
                                      {readme
                                        ? "Purpose, architecture, APIs, models, and local tasks."
                                        : "Reanalyze to generate repository documentation."}
                                    </span>
                                    <span className="mt-3 block text-[10px] text-violet-400">
                                      Open documentation →
                                    </span>
                                  </span>
                                </button>
                              </Panel>
                              <Panel title="Tech stack" icon={Boxes}>
                                <div className="flex flex-wrap gap-2 px-5 pb-4 pt-5">
                                  {techStack.map((tech, index) => (
                                    <span key={tech} className="tech-pill">
                                      <span
                                        className={
                                          index % 2
                                            ? "text-cyan-300"
                                            : "text-violet-300"
                                        }
                                      >
                                        ✳
                                      </span>
                                      {tech}
                                    </span>
                                  ))}
                                  {!techStack.length && (
                                    <span className="text-xs text-zinc-500">
                                      No recognized framework manifests in the
                                      inspected files.
                                    </span>
                                  )}
                                </div>
                                <p className="px-5 pb-5 text-[10px] text-zinc-600">
                                  Detected from inspected dependency manifests
                                </p>
                              </Panel>
                            </div>
                            <Panel
                              title="Good places to start"
                              icon={Braces}
                              className="mt-5"
                              action={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate("tour")}
                                >
                                  Explore files
                                  <ArrowRight />
                                </Button>
                              }
                            >
                              <div className="grid divide-y divide-white/6 md:grid-cols-3 md:divide-x md:divide-y-0">
                                {coreFiles.slice(0, 3).map((file, index) => (
                                  <button
                                    key={file.path}
                                    onClick={() => {
                                      setTourPath(file.path);
                                      navigate("tour");
                                    }}
                                    className="flex min-w-0 items-center gap-3 p-5 text-left hover:bg-white/[0.025]"
                                  >
                                    <span className="font-mono text-[11px] text-zinc-700">
                                      0{index + 1}
                                    </span>
                                    <FileCode2
                                      size={18}
                                      className="shrink-0 text-violet-400/70"
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate font-mono text-[11px] text-zinc-300">
                                        {file.path.split("/").pop()}
                                      </span>
                                      <span className="mt-1 block text-[10px] text-zinc-600">
                                        {file.label}
                                      </span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </Panel>
                            <button
                              onClick={() => setChat(true)}
                              className="assistant-banner mt-5 flex w-full items-center gap-4 rounded-xl border border-violet-400/15 px-5 py-4 text-left"
                            >
                              <span className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                                <Sparkles size={18} />
                              </span>
                              <span className="flex-1">
                                <span className="text-xs text-zinc-200">
                                  Every codebase has a story. Ask yours.
                                </span>
                                <span className="mt-1 block text-[11px] text-zinc-500">
                                  {chatReady
                                    ? "Ask a question and follow citations back to the source."
                                    : "Configure Gemini or Groq to enable the assistant."}
                                </span>
                              </span>
                              <ArrowRight
                                size={15}
                                className="text-violet-300"
                              />
                            </button>
                          </>
                        )}
                        {section === "architecture" && (
                          <Panel
                            title="System architecture"
                            icon={Network}
                            action={
                              diagram && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    downloadText("architecture.mmd", diagram)
                                  }
                                >
                                  <ArrowDownToLine />
                                  Export Mermaid
                                </Button>
                              )
                            }
                          >
                            {assets?.architectureTree?.length ? (
                              <ArchitectureExplorer
                                nodes={assets.architectureTree}
                                flows={assets.flows}
                                repository={name}
                                openFile={openSource}
                              />
                            ) : diagram ? (
                              <ArchitectureMap
                                expanded
                                source={diagram}
                                description={`Architecture for ${name}`}
                              />
                            ) : (
                              <Empty
                                title="Architecture unavailable"
                                text="Reanalyze this repository to build its source-based diagram."
                              />
                            )}
                          </Panel>
                        )}
                        {section === "documentation" && (
                          <Panel
                            title="Repository documentation"
                            icon={FileText}
                            action={
                              <span className="text-[10px] text-zinc-500">
                                {assets?.generatedBy ?? "Source analysis"}
                              </span>
                            }
                          >
                            {readme ? (
                              <article className="mx-auto max-w-[850px] p-6 sm:p-10">
                                <Markdown>{readme}</Markdown>
                              </article>
                            ) : (
                              <Empty
                                title="Documentation unavailable"
                                text="Reanalyze this repository to generate documentation from the source."
                              />
                            )}
                          </Panel>
                        )}
                        {section === "tour" && (
                          <CodeTour
                            key={`${selected}:${tourPath}`}
                            initialPath={tourPath}
                            entries={treeEntries}
                            highlights={coreFiles}
                            repositoryId={selected}
                            commitUrl={data?.repository.url}
                            commitSha={data?.commitSha}
                            complete={Boolean(data.repository.entries)}
                          />
                        )}
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </>
            )}
          </main>
        </div>
        <AnimatePresence>
          {selected && data && !chat && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed bottom-6 right-6 z-30"
            >
              <Button
                size="lg"
                onClick={() => setChat(true)}
                className="chat-launcher !h-12 !rounded-full !px-5"
              >
                <Sparkles />
                Ask CodeLens
                <Plus className="ml-1 !size-3" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        {selected && (
          <ChatDrawer
            key={selected}
            open={chat}
            onOpenChange={setChat}
            repositoryId={selected}
            repositoryName={name}
            privateHistory={config.database === "supabase"}
            ready={chatReady}
          />
        )}
        <Modal
          open={view === "mobile"}
          onOpenChange={(open) => !open && setView(null)}
          title="Your workspace"
          description="Explore your codebase."
        >
          <div className="flex max-h-[60dvh] flex-col overflow-auto">
            {sidebar}
          </div>
        </Modal>
        <Modal
          open={view === "search"}
          onOpenChange={(open) => !open && setView(null)}
          title="Find your focus"
          description="Search repository history and workspace views."
        >
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 px-3">
            <Search size={15} className="text-zinc-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search workspace"
              placeholder="Find a view or repository…"
              className="h-11 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div className="max-h-80 overflow-auto">
            {selected &&
              navigation
                .filter((item) =>
                  item.title.toLowerCase().includes(search.toLowerCase()),
                )
                .map((item) => (
                  <button
                    key={item.id}
                    className="nav-item"
                    onClick={() => navigate(item.id)}
                  >
                    <item.icon size={16} />
                    {item.title}
                  </button>
                ))}
            {history
              .filter((repo) =>
                repo.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((repo) => (
                <button
                  key={repo.id}
                  className="nav-item"
                  onClick={() => select(repo.id)}
                >
                  <Github size={16} />
                  {repo.name}
                </button>
              ))}
          </div>
        </Modal>
        <Modal
          open={view === "delete" && Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open && !deleting) {
              setDeleteTarget(null);
              setView(null);
            }
          }}
          title={
            "Delete " + (deleteTarget?.name ?? "repository") + " from history?"
          }
          description="This removes the analysis from your saved history and deletes its associated chat and index data."
        >
          {deleteError && (
            <p role="alert" className="mb-4 text-sm text-rose-300">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setView(null)}
            >
              Cancel
            </Button>
            <Button disabled={deleting} onClick={deleteRepository}>
              {deleting ? "Deleting…" : "Delete from history"}
            </Button>
          </div>
        </Modal>
      </div>
    </MotionConfig>
  );
}
