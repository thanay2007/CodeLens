"use client";

import dynamic from "next/dynamic";
import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Braces,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  FileCode2,
  FileText,
  GitBranch,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Network,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
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
import {
  architecture as demoArchitecture,
  coreFiles as demoFiles,
  demoReadme,
} from "@/lib/demo";
import { cn, downloadText } from "@/lib/utils";
import type {
  RepositoryData,
  RepositorySummary,
  ServiceConfiguration,
} from "@/lib/types";
import { ChatDrawer } from "./chat-drawer";
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
type Section =
  "overview" | "architecture" | "documentation" | "tour" | "deploy";
type View =
  "settings" | "search" | "mobile" | "upgrade" | "help" | "files" | null;
type Detail = RepositorySummary & { data: RepositoryData | null };
const navigation: { id: Section; title: string; icon: LucideIcon }[] = [
  { id: "overview", title: "Overview", icon: LayoutDashboard },
  { id: "architecture", title: "Architecture", icon: Network },
  { id: "documentation", title: "Documentation", icon: FileText },
  { id: "tour", title: "Code tour", icon: Braces },
  { id: "deploy", title: "Deploy guide", icon: Rocket },
];
const defaults: ServiceConfiguration = {
  clerk: false,
  groq: false,
  pinecone: false,
  local: true,
  database: "sqlite",
};

function Account({
  enabled,
  onIdentity,
  onSettings,
}: {
  enabled: boolean;
  onIdentity: () => void;
  onSettings: () => void;
}) {
  return enabled ? (
    <ClerkAccount onIdentity={onIdentity} />
  ) : (
    <button
      onClick={onSettings}
      className="flex size-8 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/15 text-[11px] text-violet-100"
      aria-label="Workspace settings"
    >
      CL
    </button>
  );
}
function ClerkAccount({ onIdentity }: { onIdentity: () => void }) {
  const { isLoaded, isSignedIn, user } = useUser();
  useEffect(() => {
    if (isLoaded) onIdentity();
  }, [isLoaded, user?.id, onIdentity]);
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
function Empty({
  title,
  text,
  onSetup,
}: {
  title: string;
  text: string;
  onSetup?: () => void;
}) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center p-8 text-center">
      <Sparkles className="mb-4 size-7 text-violet-400/60" />
      <h3 className="text-sm text-zinc-200">{title}</h3>
      <p className="mt-2 max-w-md text-xs leading-6 text-zinc-500">{text}</p>
      {onSetup && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onSetup}>
          View integrations
          <ArrowRight />
        </Button>
      )}
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
    [tourFile, setTourFile] = useState(0);
  const [revision, setRevision] = useState(0);
  const chosen = useRef(false),
    repoInput = useRef<HTMLInputElement>(null);
  const identityChanged = useCallback(() => {
    chosen.current = false;
    setActive(null);
    setSelected(null);
    setRevision((value) => value + 1);
  }, []);

  const refreshHistory = useCallback(async (signal?: AbortSignal) => {
    const result = await jsonFetch("/api/repositories", { signal });
    setHistory(result.repositories);
    if (!chosen.current && result.repositories[0]) {
      chosen.current = true;
      setSelected(result.repositories[0].id);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    jsonFetch("/api/workspace", { signal: controller.signal })
      .then(setConfig)
      .catch(() => undefined);
    refreshHistory(controller.signal)
      .then(() => setError(""))
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [revision, refreshHistory]);
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
    chosen.current = true;
    setActive(null);
    setSelected(id);
    setView(null);
    setError("");
    setSection("overview");
    setTourFile(0);
  }
  function navigate(id: Section) {
    setSection(id);
    setView(null);
  }
  function focusRepo() {
    setView(null);
    repoInput.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function analyze(url: string) {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const repo = await jsonFetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      select(repo.id);
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
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
  const demo = !selected,
    data = active?.data,
    assets = data?.assets;
  const name = demo
    ? "acme/storefront"
    : active?.name ||
      history.find((item) => item.id === selected)?.name ||
      "Loading repository";
  const coreFiles = demo
    ? demoFiles
    : assets?.coreFiles || data?.coreFiles || [];
  const diagram = demo ? demoArchitecture : assets?.architecture;
  const readme = demo
    ? demoReadme
    : assets?.readme ||
      data?.files.find((file) => /(^|\/)readme\.md$/i.test(file.path))?.content;
  const busy = Boolean(
    active && ["queued", "processing"].includes(active.status),
  );
  const techStack = demo
    ? [
        "Next.js",
        "TypeScript",
        "Tailwind CSS",
        "Prisma",
        "PostgreSQL",
        "Stripe",
      ]
    : data?.techStack || [];
  const score = demo ? 85 : data?.healthScore;

  const sidebar = (
    <>
      <div className="px-5 pb-7 pt-7">
        <Logo />
      </div>
      <button
        onClick={() => setView("settings")}
        className="mx-4 mb-7 flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.025] p-3 text-left"
      >
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
      </button>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="space-y-1 px-3" aria-label="Main navigation">
        {navigation.map(({ id, title, icon: Icon }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            aria-current={section === id ? "page" : undefined}
            className={cn("nav-item", section === id && "nav-item-active")}
          >
            <Icon size={17} strokeWidth={1.7} />
            {title}
            {section === id && (
              <span className="ml-auto size-1.5 rounded-full bg-violet-400" />
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-label mt-8 flex items-center justify-between">
        REPOSITORIES
        <button onClick={focusRepo} aria-label="Add repository">
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-1 px-3">
        {history.map((repo) => (
          <button
            key={repo.id}
            onClick={() => select(repo.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-zinc-500 transition hover:bg-white/5",
              selected === repo.id && "bg-violet-500/10 text-violet-200",
            )}
          >
            <Github size={14} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px]">{repo.name}</span>
              <span className="mt-1 block text-[9px] text-zinc-600">
                {repo.status} · {new Date(repo.createdAt).toLocaleDateString()}
              </span>
            </span>
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                repo.status === "ready"
                  ? "bg-emerald-400"
                  : repo.status === "failed"
                    ? "bg-rose-400"
                    : "bg-violet-400",
              )}
            />
          </button>
        ))}
        <button
          onClick={() => select(null)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs text-zinc-500",
            demo && "bg-white/[0.035] text-zinc-300",
          )}
        >
          <Sparkles size={14} />
          Storefront demo
          <span className="ml-auto text-[9px] text-zinc-600">SAMPLE</span>
        </button>
        <button onClick={focusRepo} className="nav-item !text-[11px]">
          <Plus size={14} />
          Analyze a repository
        </button>
      </div>
      <div className="flex-1" />
      <div className="pro-card mx-4 my-4 rounded-xl border border-violet-400/15 p-4">
        <p className="flex items-center gap-2 text-xs text-violet-300">
          <Zap size={15} />A little more superpower.
        </p>
        <p className="mt-3 text-[11px] leading-5 text-zinc-500">
          Bigger codebases. Deeper insights.
          <br />A workspace that grows with you.
        </p>
        <Button
          onClick={() => setView("upgrade")}
          variant="outline"
          className="mt-4 h-8 w-full border-violet-400/20 bg-violet-500/10 text-xs text-violet-200"
        >
          Explore Pro
          <ArrowUpRight className="ml-auto" />
        </Button>
      </div>
      <div className="border-t border-white/6 px-3 py-3">
        <button className="nav-item" onClick={() => setView("settings")}>
          <Settings2 size={16} />
          Settings
        </button>
        <button className="nav-item" onClick={() => setView("help")}>
          <CircleHelp size={16} />
          Getting started
        </button>
      </div>
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
              <span className="hidden text-zinc-600 sm:inline">Workspace</span>
              <ChevronRight
                size={13}
                className="hidden text-zinc-700 sm:block"
              />
              <Github size={15} className="shrink-0 text-zinc-500" />
              <span className="truncate text-zinc-300">{name}</span>
              {demo && (
                <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-zinc-500">
                  Demo
                </span>
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
              <Account
                enabled={clerkEnabled}
                onIdentity={identityChanged}
                onSettings={() => setView("settings")}
              />
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
                <div className="mb-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[2px] text-violet-300">
                  <Sparkles size={13} />
                  Clarity starts here
                </div>
                <h1 className="text-[clamp(25px,3.1vw,40px)] font-semibold leading-[1.2] tracking-[-1.5px]">
                  Big codebase.
                  <span className="hero-gradient"> Clear picture.</span>
                </h1>
                <p className="mt-3 text-[13px] leading-6 text-zinc-400">
                  Turn unfamiliar code into your next head start.
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
                    ref={repoInput}
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
                  Public repositories · Commit-pinned source snapshots · Likely
                  secrets redacted
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
            <div className="mb-5 mt-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-[10px] text-zinc-600">
                  <span className="size-1.5 rounded-full bg-emerald-400/80" />
                  {demo ? "EXAMPLE WORKSPACE" : "YOUR SOURCE SNAPSHOT"}
                  <span className="px-1 text-zinc-700">/</span>
                  <span className="font-mono">
                    {data?.commitSha.slice(0, 7) ||
                      (demo ? "acme/storefront" : active?.status || "Loading")}
                  </span>
                </div>
                <h2 className="text-xl font-semibold tracking-[-0.6px]">
                  {section === "overview"
                    ? "Repository overview"
                    : navigation.find((item) => item.id === section)?.title}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {!demo && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || busy}
                    onClick={() => analyze(active?.url || "")}
                  >
                    <RefreshCw className="!size-3.5" />
                    Reanalyze
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!readme}
                  onClick={() => readme && downloadText("README.md", readme)}
                >
                  <ArrowDownToLine className="!size-3.5" />
                  Export README
                </Button>
              </div>
            </div>
            {!demo && active && (
              <div className="panel mb-5 px-5 py-4">
                <div className="flex items-center gap-3">
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin text-violet-400" />
                  ) : (
                    <Check className="size-4 text-emerald-400" />
                  )}
                  <span role="status" className="flex-1 text-xs text-zinc-300">
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
                      {coreFiles.length}
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
                {!demo && !data ? (
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
                      "Source files, code health signals, and framework detection will appear as the analysis progresses."
                    }
                  />
                ) : (
                  <>
                    {section === "overview" && (
                      <>
                        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                          {[
                            {
                              icon: FileCode2,
                              label: "Files in focus",
                              value: demo
                                ? "128"
                                : String(data?.files.length || 0),
                              note: demo
                                ? "Across the sample repository"
                                : `of ${data?.repository.fileCount}${data?.repository.truncated ? "+" : ""} repository files`,
                              color: "violet",
                            },
                            {
                              icon: Code2,
                              label: "Inspected lines",
                              value: demo
                                ? "12.4k"
                                : (
                                    data?.files.reduce(
                                      (sum, file) => sum + file.lines,
                                      0,
                                    ) || 0
                                  ).toLocaleString(),
                              note: "Within the source snapshot",
                              color: "cyan",
                            },
                            {
                              icon: Layers3,
                              label: "Languages",
                              value: demo
                                ? "04"
                                : String(
                                    Object.keys(data?.languages || {}).length,
                                  ),
                              note: demo
                                ? "TypeScript leads the way"
                                : Object.entries(data?.languages || {}).sort(
                                    (a, b) => b[1] - a[1],
                                  )[0]?.[0] || "Source detected",
                              color: "pink",
                            },
                            {
                              icon: Activity,
                              label: "Inspection score",
                              value: String(score ?? "—"),
                              note: demo
                                ? "Sample assessment"
                                : "Heuristic signals · Limited coverage",
                              color: "green",
                            },
                          ].map(({ icon: Icon, label, value, note, color }) => (
                            <div className="stat-card" key={label}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-zinc-500">
                                  {label}
                                </span>
                                <span className={`stat-icon stat-${color}`}>
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
                          ))}
                        </div>
                        <div className="overview-grid">
                          <Panel
                            title="Architecture at a glance"
                            icon={Network}
                            action={
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate("architecture")}
                                className="!h-6 !px-1 !text-[10px]"
                              >
                                Explore map
                                <ArrowUpRight className="!size-3" />
                              </Button>
                            }
                          >
                            {diagram ? (
                              <ArchitectureMap
                                source={diagram}
                                description={`System architecture for ${name}`}
                              />
                            ) : (
                              <Empty
                                title="An architecture map, grounded in your code."
                                text="Configure Groq and reanalyze to generate this repository’s system diagram."
                                onSetup={() => setView("settings")}
                              />
                            )}
                          </Panel>
                          <Panel title="Code health" icon={ShieldCheck}>
                            <Health
                              score={score || 0}
                              demo={demo}
                              findings={data?.findings.length || 0}
                            />
                            <div className="mx-5 mb-4 border-t border-white/6 pt-3 text-[10px] leading-5 text-zinc-500">
                              {demo
                                ? "Illustrative assessment"
                                : "Pattern-based checks on inspected files. This score does not certify security; excluded files and undetected secrets remain possible."}
                            </div>
                          </Panel>
                          <Panel
                            title="Your documentation"
                            icon={FileText}
                            action={
                              <span className="text-[9px] text-violet-300">
                                {demo
                                  ? "Sample"
                                  : assets
                                    ? "AI generated"
                                    : "Repository source"}
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
                                  README.md
                                </span>
                                <span className="mt-2 block text-[11px] leading-5 text-zinc-500">
                                  {readme
                                    ? "The what, why, and how.\nYour starting point in this codebase."
                                    : "Generate a contributor-ready README with Groq."}
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
                              {demo
                                ? "Example dependencies"
                                : "Detected from inspected dependency manifests"}
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
                                  setTourFile(index);
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
                        {!demo && Boolean(data?.findings.length) && (
                          <Panel
                            title="Signals to investigate"
                            icon={ShieldCheck}
                            className="mt-5"
                          >
                            <div className="divide-y divide-white/5">
                              {data?.findings
                                .slice(0, 10)
                                .map((finding, index) => (
                                  <div
                                    key={index}
                                    className="flex items-start gap-3 px-5 py-4"
                                  >
                                    <span
                                      className={cn(
                                        "mt-0.5 rounded px-2 py-0.5 text-[9px] uppercase",
                                        finding.severity === "high"
                                          ? "bg-rose-400/10 text-rose-300"
                                          : "bg-amber-400/10 text-amber-300",
                                      )}
                                    >
                                      {finding.severity}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="break-words font-mono text-[10px] text-zinc-400">
                                        {finding.path}:{finding.line}
                                      </p>
                                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                                        {finding.message}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </Panel>
                        )}
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
                              {demo
                                ? "Try a sample conversation."
                                : data?.namespace && config.groq
                                  ? "Answers grounded in your indexed source, with citations."
                                  : "Connect Groq and Pinecone to enable codebase conversations."}
                            </span>
                          </span>
                          <ArrowRight size={15} className="text-violet-300" />
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
                        {diagram ? (
                          <>
                            <ArchitectureMap
                              expanded
                              source={diagram}
                              description={`Architecture for ${name}`}
                            />
                            <p className="border-t border-white/8 p-5 text-xs leading-6 text-zinc-500">
                              {demo
                                ? "Sample system architecture."
                                : `Generated from the inspected source at commit ${data?.commitSha.slice(0, 7)}. Review inferred relationships against the source.`}
                            </p>
                          </>
                        ) : (
                          <Empty
                            title="Architecture generation needs Groq."
                            text="Add your Groq key in the server environment and reanalyze this repository."
                            onSetup={() => setView("settings")}
                          />
                        )}
                      </Panel>
                    )}
                    {section === "documentation" && (
                      <Panel
                        title="README.md"
                        icon={FileText}
                        action={
                          <span className="text-[10px] text-zinc-500">
                            {demo
                              ? "Sample"
                              : assets
                                ? assets.generatedBy
                                : "Original repository README"}
                          </span>
                        }
                      >
                        {readme ? (
                          <article className="mx-auto max-w-[850px] p-6 sm:p-10">
                            <Markdown>{readme}</Markdown>
                          </article>
                        ) : (
                          <Empty
                            title="A README is waiting to be written."
                            text="No README was found in this bounded snapshot. Configure Groq and reanalyze to generate one."
                            onSetup={() => setView("settings")}
                          />
                        )}
                      </Panel>
                    )}
                    {section === "tour" && (
                      <CodeTour
                        key={`${selected}:${coreFiles.length}:${tourFile}`}
                        initialFile={tourFile}
                        files={coreFiles}
                        demo={demo}
                      />
                    )}
                    {section === "deploy" && (
                      <DeployGuide
                        demo={demo}
                        guides={assets?.deployment}
                        onSetup={() => setView("settings")}
                      />
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
            <footer className="mb-3 mt-8 flex items-center justify-between gap-3 border-t border-white/5 pt-5 text-[10px] text-zinc-600">
              <span>Less digging. More building.</span>
              <button
                onClick={() => setView("files")}
                className="flex items-center gap-1.5 hover:text-zinc-300"
              >
                <FileCode2 size={11} />
                {demo ? "Sample workspace" : "Inspect source coverage"}
              </button>
            </footer>
          </main>
        </div>
        <AnimatePresence>
          {!chat && (
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
        <ChatDrawer
          key={selected || "demo"}
          open={chat}
          onOpenChange={setChat}
          repositoryId={selected}
          repositoryName={name}
          ready={Boolean(
            active?.status === "ready" && data?.namespace && config.groq,
          )}
        />
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
          open={view === "settings"}
          onOpenChange={(open) => !open && setView(null)}
          title="Workspace integrations"
          description="Connection status reflects the server configuration. New credentials take effect after restarting the server; reanalyze a repository to generate missing assets."
        >
          <div className="space-y-3">
            {[
              {
                label: "Clerk authentication",
                value: config.clerk
                  ? "Configured · Sign in to access your data"
                  : config.local
                    ? "Development workspace · No sign-in required"
                    : "Required before production use",
              },
              {
                label: "Groq generation",
                value: config.groq
                  ? "Configured"
                  : "Setup needed · GROQ_API_KEY",
              },
              {
                label: "Pinecone retrieval",
                value: config.pinecone
                  ? "Configured"
                  : "Setup needed · PINECONE_API_KEY + PINECONE_INDEX",
              },
              {
                label: "Saved workspace",
                value:
                  config.database === "postgresql"
                    ? "PostgreSQL"
                    : "SQLite · Local persistent storage",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-white/8 p-3.5"
              >
                <p className="text-xs text-zinc-200">{item.label}</p>
                <p className="mt-1.5 text-[11px] leading-5 text-zinc-500">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[11px] leading-5 text-zinc-500">
            Configure secrets in .env.local or your hosting provider. Keys are
            never stored in the browser.
          </p>
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
            {navigation
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
          open={view === "files"}
          onOpenChange={(open) => !open && setView(null)}
          title="Source coverage"
          description={
            demo
              ? "Select a real repository to inspect its source coverage."
              : `${data?.files.length || 0} source files inspected at ${data?.commitSha.slice(0, 7) || "the current snapshot"}.`
          }
        >
          <div className="max-h-80 overflow-auto space-y-2 font-mono text-[11px] text-zinc-400">
            {data?.files.map((file) => (
              <div key={file.path} className="flex justify-between gap-3">
                <span className="break-all">{file.path}</span>
                <span className="shrink-0 text-zinc-600">
                  {file.lines} lines
                </span>
              </div>
            ))}
          </div>
        </Modal>
        <Modal
          open={view === "help"}
          onOpenChange={(open) => !open && setView(null)}
          title="Bring a codebase into focus."
          description="Paste a public GitHub URL to create a saved source snapshot. Follow real progress as files are fetched, redacted, inspected, and chunked."
        >
          <ol className="list-decimal space-y-4 pl-5 text-sm leading-6 text-zinc-400">
            <li>
              Browse source files, detected frameworks, and heuristic health
              signals without paid services.
            </li>
            <li>
              Configure Groq to generate documentation, architecture, file
              explanations, and deployment guides.
            </li>
            <li>
              Configure a Pinecone vector index and its hosted embedding model
              to enable cited codebase chat.
            </li>
            <li>
              Use Clerk and PostgreSQL for a hosted workspace with per-user
              history and saved conversations.
            </li>
          </ol>
        </Modal>
        <Modal
          open={view === "upgrade"}
          onOpenChange={(open) => !open && setView(null)}
          title="More room for your next big idea."
          description="Pro is a product preview. Billing is not connected."
        >
          <div className="space-y-4 rounded-xl border border-violet-400/20 bg-violet-500/5 p-5">
            {[
              "Larger source snapshots",
              "Shared team workspaces",
              "Higher conversation limits",
              "Deeper architecture insights",
            ].map((text) => (
              <p
                className="flex items-center gap-2 text-sm text-zinc-400"
                key={text}
              >
                <Check size={14} className="text-violet-400" />
                {text}
              </p>
            ))}
          </div>
        </Modal>
      </div>
    </MotionConfig>
  );
}

function Health({
  score,
  demo,
  findings,
}: {
  score: number;
  demo: boolean;
  findings: number;
}) {
  return (
    <div className="flex items-center gap-5 px-5 pb-4 pt-5">
      <div className="health-ring relative size-[115px] shrink-0">
        <svg
          viewBox="0 0 120 120"
          className="size-full -rotate-90"
          aria-label={`${demo ? "Sample" : "Heuristic inspection"} score ${score} out of 100`}
          role="img"
        >
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke="#202027"
            strokeWidth="6"
          />
          <motion.circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke="url(#health-gradient)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="301.59"
            initial={{ strokeDashoffset: 301.59 }}
            animate={{ strokeDashoffset: 301.59 * (1 - score / 100) }}
            transition={{ duration: 1 }}
          />
          <defs>
            <linearGradient id="health-gradient">
              <stop stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#34d4c5" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[30px] font-semibold tracking-[-1.5px]">
            {score}
            <span className="ml-1 text-xs tracking-normal text-zinc-600">
              /100
            </span>
          </span>
          <span className="text-[9px] text-violet-300">
            {demo ? "Sample score" : "Inspected files"}
          </span>
        </div>
      </div>
      <div className="space-y-3 text-[11px] text-zinc-500">
        <p>
          <span className="mr-2 text-violet-400">●</span>
          {demo ? "Illustrative signals" : `${findings} signals found`}
        </p>
        <p>
          <span className="mr-2 text-cyan-400">●</span>Source-aware checks
        </p>
        <p>
          <span className="mr-2 text-amber-300">●</span>Review recommended
        </p>
      </div>
    </div>
  );
}
function DeployGuide({
  demo,
  guides,
  onSetup,
}: {
  demo: boolean;
  guides?: { vercel: string; docker: string; aws: string };
  onSetup: () => void;
}) {
  const [target, setTarget] = useState<"vercel" | "docker" | "aws">("vercel");
  const sample = {
    vercel:
      "## Vercel · Sample storefront\n\n1. Import the Next.js repository in Vercel.\n2. Configure database, Clerk, and payment environment variables.\n3. Generate Prisma's client in the build and apply migrations as a release step.\n4. Deploy and verify the production domain and webhook configuration.",
    docker:
      "## Docker · Sample storefront\n\n1. Enable Next.js standalone output.\n2. Build with a multi-stage Dockerfile and copy the standalone server, static assets, and public directory.\n3. Inject runtime credentials and expose port 3000.\n4. Run database migrations in a release job.",
    aws: "## AWS · Sample storefront\n\n1. Publish a production container to ECR.\n2. Provision an RDS PostgreSQL database.\n3. Deploy an ECS Fargate service behind an HTTPS load balancer.\n4. Supply credentials through Secrets Manager and verify application health.",
  };
  const value = demo ? sample[target] : guides?.[target];
  return (
    <Panel
      title="Your launch checklist"
      icon={Rocket}
      action={
        <span className="text-[10px] text-zinc-500">
          {demo ? "Sample guide" : "AI generated · Review before use"}
        </span>
      }
    >
      <div className="flex gap-2 border-b border-white/8 p-4">
        {(["vercel", "docker", "aws"] as const).map((item) => (
          <Button
            key={item}
            variant={target === item ? "default" : "outline"}
            size="sm"
            onClick={() => setTarget(item)}
          >
            {item === "aws"
              ? "AWS"
              : item.charAt(0).toUpperCase() + item.slice(1)}
          </Button>
        ))}
      </div>
      {value ? (
        <article className="max-w-[850px] p-6 sm:p-9">
          <Markdown>{value}</Markdown>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => downloadText(`deploy-${target}.md`, value)}
          >
            <ArrowDownToLine />
            Download guide
          </Button>
        </article>
      ) : (
        <Empty
          title="A launch plan for this repository."
          text="Configure Groq and reanalyze to generate architecture-specific guidance. No deployment is performed automatically."
          onSetup={onSetup}
        />
      )}
    </Panel>
  );
}
