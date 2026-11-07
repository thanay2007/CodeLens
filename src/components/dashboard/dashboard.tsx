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
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Command,
  ExternalLink,
  FileCode2,
  FileText,
  GitBranch,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Network,
  Plus,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
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
  architecture,
  coreFiles,
  demoReadme,
  demoRepository,
} from "@/lib/demo";
import { cn, downloadText } from "@/lib/utils";
import type { RepositoryPreview } from "@/lib/types";
import { ChatDrawer } from "./chat-drawer";
import { CodeTour } from "./code-tour";
import { Markdown } from "./markdown";

const ArchitectureMap = dynamic(() => import("./architecture-map"), {
  ssr: false,
  loading: () => (
    <div className="diagram-grid flex min-h-[264px] items-center justify-center gap-2 text-xs text-zinc-500">
      <LoaderCircle className="size-4 animate-spin" />
      Loading diagram…
    </div>
  ),
});

type Section =
  "overview" | "architecture" | "documentation" | "tour" | "deploy";
type ModalName = "settings" | "help" | "upgrade" | "search" | "mobile" | null;
const navigation: {
  id: Section;
  title: string;
  icon: LucideIcon;
  shortcut?: string;
}[] = [
  { id: "overview", title: "Overview", icon: LayoutDashboard },
  { id: "architecture", title: "Architecture", icon: Network },
  { id: "documentation", title: "Documentation", icon: FileText },
  { id: "tour", title: "Code tour", icon: Braces, shortcut: "4" },
  { id: "deploy", title: "Deploy guide", icon: Rocket },
];
const sectionTitles: Record<Section, string> = {
  overview: "Repository overview",
  architecture: "Architecture explorer",
  documentation: "Your documentation, sorted.",
  tour: "A guided look under the hood.",
  deploy: "From code to production.",
};

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="logo-mark">
        <Code2 size={21} strokeWidth={2.3} />
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

function ClerkProfile() {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded)
    return <span className="size-8 animate-pulse rounded-full bg-zinc-800" />;
  return isSignedIn ? (
    <UserButton appearance={{ elements: { avatarBox: "size-8" } }} />
  ) : (
    <SignInButton mode="modal">
      <Button variant="outline" size="sm">
        Sign in
      </Button>
    </SignInButton>
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

export function Dashboard({ clerkEnabled }: { clerkEnabled: boolean }) {
  const [section, setSection] = useState<Section>("overview");
  const [tourFile, setTourFile] = useState(0);
  const [modal, setModal] = useState<ModalName>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<RepositoryPreview | null>(null);
  const [history, setHistory] = useState<RepositoryPreview[]>([]);
  const [search, setSearch] = useState("");
  const repoInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setModal((m) => (m === "search" ? null : "search"));
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      request.current?.abort();
    };
  }, []);

  function navigate(id: Section) {
    setSection(id);
    setModal(null);
  }
  function focusRepo() {
    setModal(null);
    setSection("overview");
    setTimeout(() => repoInput.current?.focus(), 80);
  }

  async function inspect(event: FormEvent) {
    event.preventDefault();
    if (loading || !repoUrl.trim()) return;
    setLoading(true);
    setError("");
    request.current = new AbortController();
    const timeout = setTimeout(() => request.current?.abort(), 40_000);
    try {
      const response = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl.trim() }),
        signal: request.current.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to inspect this repository.");
      setPreview(data);
      setHistory((h) =>
        [data, ...h.filter((item) => item.fullName !== data.fullName)].slice(
          0,
          5,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error && err.name === "AbortError"
          ? "The request timed out. Please try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  const sidebar = (
    <>
      <div className="px-5 pb-7 pt-7">
        <Logo />
      </div>
      <button
        onClick={() => setModal("settings")}
        className="mx-4 mb-7 flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2.5 text-left transition hover:bg-white/5"
      >
        <span className="flex size-7 items-center justify-center rounded-md border border-violet-400/20 bg-violet-500/10 text-xs text-violet-300">
          W
        </span>
        <span className="flex-1 text-xs font-medium text-zinc-300">
          Personal workspace
          <span className="mt-0.5 block text-[10px] font-normal text-zinc-600">
            Free plan
          </span>
        </span>
        <ChevronDown size={13} className="text-zinc-600" />
      </button>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="space-y-1 px-3" aria-label="Main navigation">
        {navigation.map(({ id, title, icon: Icon, shortcut }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            aria-current={section === id ? "page" : undefined}
            className={cn("nav-item", section === id && "nav-item-active")}
          >
            <Icon size={17} strokeWidth={1.7} />
            <span>{title}</span>
            {shortcut && (
              <span className="ml-auto rounded border border-white/8 px-1.5 py-0.5 text-[9px] text-zinc-500">
                {shortcut}
              </span>
            )}
            {section === id && (
              <span className="ml-auto size-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-label mt-8 flex items-center justify-between">
        REPOSITORIES
        <button
          onClick={focusRepo}
          aria-label="Add repository"
          className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="space-y-1 px-3">
        <button
          onClick={() => navigate("overview")}
          className="flex w-full items-center gap-2.5 rounded-lg bg-white/[0.035] px-3 py-2.5 text-left"
        >
          <Github size={15} className="text-zinc-400" />
          <span className="truncate text-xs text-zinc-300">
            acme/storefront
          </span>
          <span className="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-400" />
        </button>
        {history.map((repo) => (
          <button
            key={repo.fullName}
            onClick={() => {
              setPreview(repo);
              setModal(null);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          >
            <Github size={15} className="shrink-0" />
            <span className="truncate text-[11px]">{repo.fullName}</span>
          </button>
        ))}
        <button
          onClick={focusRepo}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs text-zinc-600 transition hover:bg-white/5 hover:text-zinc-300"
        >
          <Plus size={15} />
          Inspect a repository
        </button>
      </div>
      <div className="flex-1" />
      <div className="pro-card mx-4 mb-4 rounded-xl border border-violet-400/15 p-4">
        <div className="mb-3 flex items-center gap-2 text-violet-300">
          <Zap size={15} />
          <span className="text-xs font-medium">A little more superpower.</span>
        </div>
        <p className="text-[11px] leading-5 text-zinc-500">
          Bigger codebases. Deeper insights.
          <br />A workspace that grows with you.
        </p>
        <Button
          onClick={() => setModal("upgrade")}
          variant="outline"
          className="mt-4 h-8 w-full border-violet-400/20 bg-violet-500/10 text-xs text-violet-200 hover:bg-violet-500/20"
        >
          Explore Pro
          <ArrowUpRight className="ml-auto !size-3.5" />
        </Button>
      </div>
      <div className="border-t border-white/6 px-3 py-3">
        <button className="nav-item !py-2" onClick={() => setModal("settings")}>
          <Settings2 size={16} />
          Settings
        </button>
        <button className="nav-item !py-2" onClick={() => setModal("help")}>
          <CircleHelp size={16} />
          Help & getting started
          <ArrowUpRight size={12} className="ml-auto text-zinc-700" />
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-white/6 px-6 py-4 text-[10px] text-zinc-600">
        <span className="size-1.5 rounded-full bg-emerald-400/80" />
        Local starter<span className="ml-auto font-mono">v0.1.0</span>
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
              onClick={() => setModal("mobile")}
            >
              <Menu />
            </Button>
            <div className="flex min-w-0 items-center gap-2.5 text-xs">
              <span className="hidden text-zinc-600 sm:inline">Workspace</span>
              <ChevronRight
                size={13}
                className="hidden text-zinc-700 sm:block"
              />
              <Github size={15} className="text-zinc-500" />
              <span className="truncate text-zinc-300">
                acme /{" "}
                <span className="font-medium text-zinc-200">storefront</span>
              </span>
              <span className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-zinc-500 sm:inline">
                Demo
              </span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setModal("search")}
                className="search-trigger"
              >
                <Search size={14} />
                <span className="hidden sm:inline">Search your workspace…</span>
                <kbd className="ml-6 hidden items-center gap-0.5 rounded border border-white/10 px-1 py-0.5 text-[9px] sm:flex">
                  <Command size={9} />K
                </kbd>
              </button>
              <span className="mx-1 hidden h-5 w-px bg-white/8 sm:block" />
              {clerkEnabled ? (
                <ClerkProfile />
              ) : (
                <button
                  onClick={() => setModal("settings")}
                  className="flex size-8 items-center justify-center rounded-full border border-violet-300/30 bg-gradient-to-br from-violet-500/40 to-fuchsia-300/10 text-[11px] font-medium text-violet-100"
                  aria-label="Local workspace profile"
                >
                  CL
                </button>
              )}
            </div>
          </header>

          <main id="main-content" className="dashboard-content">
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
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
                <form onSubmit={inspect} className="repo-input-wrap mt-6">
                  <Github size={19} className="ml-4 shrink-0 text-zinc-500" />
                  <input
                    ref={repoInput}
                    value={repoUrl}
                    onChange={(e) => {
                      setRepoUrl(e.target.value);
                      setError("");
                    }}
                    type="url"
                    required
                    maxLength={300}
                    placeholder="Paste a public GitHub repository URL…"
                    aria-label="Public GitHub repository URL"
                    aria-describedby={error ? "repo-error" : "repo-hint"}
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
                      {loading ? "Inspecting…" : "Inspect repository"}
                    </span>
                    <ArrowRight className="!size-3.5 sm:hidden" />
                  </Button>
                </form>
                {loading && (
                  <div role="status" className="mt-3">
                    <div className="h-0.5 overflow-hidden rounded bg-white/5">
                      <div className="indeterminate-progress h-full w-1/3 rounded bg-violet-400" />
                    </div>
                    <p className="mt-2 text-[10px] text-violet-300">
                      Fetching public repository metadata and file tree…
                    </p>
                  </div>
                )}
                {error ? (
                  <p
                    id="repo-error"
                    role="alert"
                    className="mt-3 text-[11px] leading-5 text-rose-300"
                  >
                    {error}
                  </p>
                ) : (
                  <p
                    id="repo-hint"
                    className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-600"
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck size={11} />
                      Public repositories only
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span>
                      Live GitHub preview. AI assets below use sample data.
                    </span>
                  </p>
                )}
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

            <div className="mb-5 mt-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-[10px] text-zinc-600">
                  <span className="size-1.5 rounded-full bg-emerald-400/80" />
                  EXAMPLE WORKSPACE<span className="px-1 text-zinc-700">/</span>
                  <span className="font-mono">acme/storefront</span>
                </div>
                <h2 className="text-xl font-semibold tracking-[-0.6px]">
                  {sectionTitles[section]}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="mr-2 hidden items-center gap-1.5 rounded-md border border-white/8 bg-white/[0.02] px-2 py-1 text-[10px] text-zinc-500 sm:flex">
                  <GitBranch size={11} />
                  main
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadText("storefront-README.md", demoReadme)
                  }
                >
                  <ArrowDownToLine className="!size-3.5" />
                  Export README
                </Button>
              </div>
            </div>

            <nav aria-label="Repository views" className="repo-tabs">
              {navigation.map(({ id, title, icon: Icon }) => (
                <button
                  key={id}
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => setSection(id)}
                  className={cn(
                    "repo-tab",
                    section === id && "repo-tab-active",
                  )}
                >
                  <Icon size={14} />
                  {title}
                  {id === "tour" && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-zinc-500">
                      4
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
                key={section}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-6"
              >
                {section === "overview" && (
                  <>
                    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                      {[
                        {
                          icon: FileCode2,
                          label: "Files in focus",
                          value: demoRepository.files.toString(),
                          note: "Across the repository",
                          color: "violet",
                        },
                        {
                          icon: Code2,
                          label: "Lines of code",
                          value: demoRepository.lines,
                          note: "Every line, more context",
                          color: "cyan",
                        },
                        {
                          icon: Layers3,
                          label: "Languages",
                          value: "04",
                          note: "TypeScript leads the way",
                          color: "pink",
                        },
                        {
                          icon: Activity,
                          label: "Repository health",
                          value: "85",
                          unit: "/100",
                          note: "Sample assessment",
                          color: "green",
                        },
                      ].map(
                        (
                          { icon: Icon, label, value, note, color, unit },
                          i,
                        ) => (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            key={label}
                            className="stat-card"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-zinc-500">
                                {label}
                              </span>
                              <span className={`stat-icon stat-${color}`}>
                                <Icon size={15} />
                              </span>
                            </div>
                            <div className="mt-3.5 flex items-baseline gap-1">
                              <span className="text-[29px] font-semibold leading-none tracking-[-1px]">
                                {value}
                              </span>
                              {unit && (
                                <span className="text-[13px] text-zinc-600">
                                  {unit}
                                </span>
                              )}
                              <span className="ml-auto font-mono text-[9px] text-zinc-700">
                                DEMO
                              </span>
                            </div>
                            <p className="mt-2.5 text-[10px] text-zinc-600">
                              {note}
                            </p>
                          </motion.div>
                        ),
                      )}
                    </div>
                    <div className="overview-grid">
                      <Panel
                        title="Architecture at a glance"
                        icon={Network}
                        action={
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSection("architecture")}
                            className="!h-6 !px-1 !text-[10px]"
                          >
                            Explore map
                            <ArrowUpRight className="!size-3" />
                          </Button>
                        }
                      >
                        <ArchitectureMap />
                      </Panel>
                      <Panel title="Code health" icon={ShieldCheck}>
                        <HealthScore />
                        <div className="mx-5 mb-4 border-t border-white/6 pt-3.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-zinc-500">
                              Illustrative assessment
                            </span>
                            <span className="rounded bg-emerald-400/5 px-1.5 py-0.5 text-emerald-400/70">
                              Sample
                            </span>
                          </div>
                        </div>
                      </Panel>
                      <Panel
                        title="Your documentation"
                        icon={FileText}
                        action={
                          <span className="rounded border border-emerald-400/15 bg-emerald-400/5 px-2 py-1 text-[9px] text-emerald-400/80">
                            Sample ready
                          </span>
                        }
                      >
                        <button
                          onClick={() => setSection("documentation")}
                          className="group flex w-full items-start gap-4 p-5 text-left"
                        >
                          <span className="flex h-[76px] w-14 shrink-0 items-center justify-center rounded-lg border border-violet-300/10 bg-gradient-to-br from-violet-400/10 to-transparent text-violet-300/70">
                            <FileText size={26} strokeWidth={1.2} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 font-mono text-xs text-zinc-200">
                              README.md
                              <ArrowUpRight
                                size={12}
                                className="text-zinc-600 transition group-hover:text-violet-300"
                              />
                            </span>
                            <span className="mt-2 block text-[11px] leading-5 text-zinc-500">
                              The what, why, and how.
                              <br />
                              Everything a new contributor needs.
                            </span>
                            <span className="mt-2.5 block text-[10px] text-violet-400">
                              Read documentation <span className="ml-1">→</span>
                            </span>
                          </span>
                        </button>
                      </Panel>
                      <Panel title="Tech stack" icon={Boxes}>
                        <div className="flex flex-wrap gap-2 px-5 pb-4 pt-5">
                          {[
                            {
                              label: "Next.js",
                              color: "text-zinc-200",
                              mark: "N",
                            },
                            {
                              label: "TypeScript",
                              color: "text-sky-400",
                              mark: "TS",
                            },
                            {
                              label: "Tailwind",
                              color: "text-cyan-300",
                              mark: "≈",
                            },
                            {
                              label: "Prisma",
                              color: "text-teal-300",
                              mark: "△",
                            },
                            {
                              label: "PostgreSQL",
                              color: "text-indigo-300",
                              mark: "P",
                            },
                            {
                              label: "Stripe",
                              color: "text-violet-400",
                              mark: "S",
                            },
                          ].map((tech) => (
                            <span key={tech.label} className="tech-pill">
                              <span
                                className={cn(
                                  "font-mono text-[10px] font-bold",
                                  tech.color,
                                )}
                              >
                                {tech.mark}
                              </span>
                              {tech.label}
                            </span>
                          ))}
                        </div>
                        <p className="px-5 pb-5 text-[10px] text-zinc-600">
                          Example dependencies · Detection coming next
                        </p>
                      </Panel>
                    </div>
                    <section className="panel mt-5 overflow-hidden">
                      <div className="panel-heading">
                        <div className="flex items-center gap-2.5">
                          <Braces size={16} className="text-zinc-400" />
                          <h2>Good places to start</h2>
                          <span className="ml-1 rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-300">
                            CODE TOUR
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSection("tour")}
                          className="!h-6 !px-1 !text-[10px]"
                        >
                          Start exploring
                          <ArrowRight className="!size-3" />
                        </Button>
                      </div>
                      <div className="grid divide-y divide-white/6 md:grid-cols-3 md:divide-x md:divide-y-0">
                        {coreFiles.slice(0, 3).map((file, i) => (
                          <button
                            key={file.path}
                            onClick={() => {
                              setTourFile(i);
                              setSection("tour");
                            }}
                            className="group flex items-center gap-3 p-5 text-left transition hover:bg-white/[0.025]"
                          >
                            <span className="font-mono text-[11px] text-zinc-700">
                              0{i + 1}
                            </span>
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/6 bg-white/[0.025] text-violet-400/70">
                              <FileCode2 size={15} />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-mono text-[11px] text-zinc-300">
                                {file.path.split("/").pop()}
                              </span>
                              <span className="mt-1 block text-[10px] text-zinc-600">
                                {file.label}
                              </span>
                            </span>
                            <ArrowUpRight
                              size={12}
                              className="ml-auto shrink-0 text-zinc-700 group-hover:text-violet-300"
                            />
                          </button>
                        ))}
                      </div>
                    </section>
                    <button
                      onClick={() => setChatOpen(true)}
                      className="assistant-banner group mt-5 flex w-full items-center gap-4 rounded-xl border border-violet-400/15 px-5 py-4 text-left"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                        <Sparkles size={18} />
                      </span>
                      <span className="flex-1">
                        <span className="text-xs font-medium text-zinc-200">
                          Every codebase has a story. Ask yours.
                        </span>
                        <span className="mt-1 block text-[11px] text-zinc-500">
                          Try “How does the database connection work?” in the
                          demo assistant.
                        </span>
                      </span>
                      <span className="hidden items-center gap-2 text-[11px] text-violet-300 sm:flex">
                        Let’s talk
                        <ArrowRight
                          size={14}
                          className="transition-transform group-hover:translate-x-1"
                        />
                      </span>
                    </button>
                  </>
                )}
                {section === "architecture" && (
                  <Panel
                    title="System architecture"
                    icon={Network}
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadText(
                            "storefront-architecture.mmd",
                            architecture,
                          )
                        }
                      >
                        <ArrowDownToLine />
                        Export Mermaid
                      </Button>
                    }
                  >
                    <ArchitectureMap expanded />
                    <div className="border-t border-white/8 px-6 py-5 text-xs leading-6 text-zinc-500">
                      This sample maps the storefront’s presentation layer,
                      server routes, and external services. AI-generated
                      architecture will be connected in a later iteration.
                    </div>
                  </Panel>
                )}
                {section === "documentation" && (
                  <Panel
                    title="README.md"
                    icon={FileText}
                    action={
                      <span className="text-[10px] text-zinc-500">
                        Rendered Markdown · Sample
                      </span>
                    }
                  >
                    <article className="mx-auto max-w-[850px] p-6 sm:p-10">
                      <Markdown>{demoReadme}</Markdown>
                    </article>
                  </Panel>
                )}
                {section === "tour" && <CodeTour initialFile={tourFile} />}
                {section === "deploy" && <DeployGuide />}
              </motion.div>
            </AnimatePresence>
            <footer className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5 text-[10px] text-zinc-600">
              <span>Less digging. More building.</span>
              <span className="flex items-center gap-1.5">
                Made for curious developers
                <span className="ml-2 text-violet-400/60">✳</span>
              </span>
            </footer>
          </main>
        </div>

        <AnimatePresence>
          {!chatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed bottom-6 right-6 z-30"
            >
              <Button
                size="lg"
                onClick={() => setChatOpen(true)}
                className="chat-launcher !h-12 !rounded-full !pl-4 !pr-5"
              >
                <Sparkles className="!size-[18px]" />
                Ask CodeLens
                <span className="ml-1 flex size-4 items-center justify-center rounded-full bg-white/10">
                  <Plus className="!size-2.5" />
                </span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <ChatDrawer open={chatOpen} onOpenChange={setChatOpen} />

        <Modal
          open={modal === "mobile"}
          onOpenChange={(open) => !open && setModal(null)}
          title="Your workspace"
          description="Navigate your CodeLens demo workspace."
        >
          <div className="flex flex-col gap-1">
            {navigation.map(({ id, title, icon: Icon }) => (
              <button
                key={id}
                className="nav-item"
                onClick={() => navigate(id)}
              >
                <Icon size={17} />
                {title}
              </button>
            ))}
            <Button variant="outline" onClick={focusRepo} className="mt-4">
              <Plus />
              Inspect a repository
            </Button>
            <Button variant="ghost" onClick={() => setModal("settings")}>
              <Settings2 />
              Workspace settings
            </Button>
          </div>
        </Modal>
        <Modal
          open={modal === "search"}
          onOpenChange={(open) => !open && setModal(null)}
          title="Find your focus"
          description="Jump to a workspace view or inspect a repository."
        >
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
            <Search size={15} className="text-zinc-500" />
            <input
              aria-label="Search workspace views"
              placeholder="Search views…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
            />
          </div>
          <div className="space-y-1">
            {navigation
              .filter((item) =>
                item.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map(({ id, title, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => navigate(id)}
                  className="nav-item"
                >
                  <Icon size={16} />
                  {title}
                  <ArrowRight size={13} className="ml-auto" />
                </button>
              ))}
            {navigation.filter((item) =>
              item.title.toLowerCase().includes(search.toLowerCase()),
            ).length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-500">
                No matching views.
              </p>
            )}
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={focusRepo}
            >
              <Github />
              Inspect a public repository
            </Button>
          </div>
        </Modal>
        <Modal
          open={modal === "settings"}
          onOpenChange={(open) => !open && setModal(null)}
          title="Workspace settings"
          description="Your local dashboard is ready. Configure integrations on the server when you are ready to connect your services."
        >
          <div className="space-y-3">
            {[
              {
                title: "Authentication",
                value: clerkEnabled
                  ? "Clerk configured"
                  : "Local demo · Clerk keys needed",
                icon: ShieldCheck,
              },
              {
                title: "Repository preview",
                value: "GitHub REST API · Connected",
                icon: Github,
              },
              {
                title: "AI generation & RAG",
                value: "Not connected · Next iteration",
                icon: Sparkles,
              },
              {
                title: "Appearance",
                value: "Deep space · Dark mode",
                icon: Layers3,
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.02] p-3.5"
              >
                <item.icon size={17} className="text-violet-400" />
                <div>
                  <p className="text-xs text-zinc-200">{item.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
        <Modal
          open={modal === "help"}
          onOpenChange={(open) => !open && setModal(null)}
          title="A clearer path through code."
          description="This first iteration gives you the workspace shell and a real public repository preview."
        >
          <ol className="space-y-5 text-sm text-zinc-400">
            {[
              "Explore the sample architecture, README, and four-file code tour.",
              "Paste a public GitHub URL to inspect live metadata and the file tree.",
              "Open the assistant to try clearly labeled sample conversations.",
              "Follow README.md to configure Clerk and build the Groq/Pinecone pipeline next.",
            ].map((text, i) => (
              <li key={text} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 font-mono text-[10px] text-violet-300">
                  0{i + 1}
                </span>
                <span className="leading-6">{text}</span>
              </li>
            ))}
          </ol>
        </Modal>
        <Modal
          open={modal === "upgrade"}
          onOpenChange={(open) => !open && setModal(null)}
          title="More room for your next big idea."
          description="CodeLens Pro is a preview of where we’re heading. Billing is not connected in this starter."
        >
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-5">
            <div className="flex items-center gap-2 text-violet-200">
              <Zap size={18} />
              <span className="font-medium">Pro workspace</span>
              <span className="ml-auto text-[10px] uppercase tracking-widest text-violet-400">
                Coming soon
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                "Larger repository indexing",
                "More codebase conversations",
                "Shared team knowledge",
                "Deeper architecture insights",
              ].map((item) => (
                <p
                  className="flex items-center gap-2 text-sm text-zinc-400"
                  key={item}
                >
                  <Check size={14} className="text-violet-400" />
                  {item}
                </p>
              ))}
            </div>
          </div>
          <Button className="mt-5 w-full" onClick={() => setModal(null)}>
            Keep exploring the starter
            <ArrowRight />
          </Button>
        </Modal>
        <Modal
          open={Boolean(preview)}
          onOpenChange={(open) => !open && setPreview(null)}
          title={preview?.fullName || "Repository preview"}
          description={
            preview?.description || "Public GitHub repository metadata"
          }
        >
          {preview && (
            <>
              <div className="mb-5 flex flex-wrap gap-2">
                {[
                  `${preview.fileCount}${preview.truncated ? "+" : ""} files`,
                  preview.language || "No primary language",
                  `${preview.stars.toLocaleString()} stars`,
                  preview.branch,
                ].map((text, i) => (
                  <span key={i} className="tech-pill">
                    {text}
                  </span>
                ))}
              </div>
              <p className="mb-3 text-xs font-medium text-zinc-300">
                File tree preview
              </p>
              <div className="max-h-52 overflow-auto rounded-lg border border-white/8 bg-black/20 p-3 font-mono text-[10px] leading-6 text-zinc-500">
                {preview.paths.map((path) => (
                  <div key={path} className="flex items-center gap-2">
                    <FileCode2
                      size={11}
                      className="shrink-0 text-violet-400/60"
                    />
                    <span>{path}</span>
                  </div>
                ))}
              </div>
              <p className="my-4 text-[11px] leading-5 text-zinc-500">
                Live metadata and up to 60 file paths.{" "}
                {preview.truncated &&
                  "GitHub returned a truncated tree; the file count is a lower bound. "}
                File contents, embeddings, and AI analysis are not generated
                yet. The dashboard continues to show the sample storefront.
              </p>
              <Button asChild variant="outline" className="w-full">
                <a href={preview.url} target="_blank" rel="noopener noreferrer">
                  View on GitHub
                  <ExternalLink />
                </a>
              </Button>
            </>
          )}
        </Modal>
      </div>
    </MotionConfig>
  );
}

function HealthScore() {
  return (
    <div className="flex items-center gap-4 px-5 pb-4 pt-5">
      <div className="health-ring relative size-[115px] shrink-0">
        <svg
          viewBox="0 0 120 120"
          className="size-full -rotate-90"
          aria-label="Sample repository health: 85 out of 100"
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
            animate={{ strokeDashoffset: 45.24 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="health-gradient">
              <stop stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#34d4c5" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[30px] font-semibold leading-none tracking-[-1.5px]">
            85
            <span className="ml-0.5 text-xs font-normal tracking-normal text-zinc-600">
              /100
            </span>
          </span>
          <span className="mt-2 text-[9px] text-emerald-400/80">
            Looking good
          </span>
        </div>
      </div>
      <div className="min-w-0 space-y-3.5">
        {[
          { label: "Maintainability", score: "90", color: "bg-violet-400" },
          { label: "Code structure", score: "86", color: "bg-cyan-400" },
          { label: "Security signals", score: "79", color: "bg-amber-300" },
        ].map((item) => (
          <div key={item.label}>
            <div className="flex items-center gap-2 text-[10px]">
              <span className={cn("size-1 rounded-full", item.color)} />
              <span className="text-zinc-500">{item.label}</span>
              <span className="ml-auto font-mono text-zinc-400">
                {item.score}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeployGuide() {
  const [target, setTarget] = useState<"vercel" | "docker" | "aws">("vercel");
  const guides = {
    vercel:
      "## Deploy the sample storefront to Vercel\n\n1. Push the application to your own GitHub repository.\n2. Import it in Vercel and select the **Next.js** framework preset.\n3. Add your database, Clerk, and Stripe environment variables.\n4. Configure Prisma generation during the build and apply migrations in a controlled release step.\n5. Deploy, then register your production URL with Clerk and your verified Stripe webhook endpoint.\n\n```bash\nnpm run build\n```",
    docker:
      "## Containerize the sample storefront\n\n1. Enable `output: 'standalone'` in your Next.js configuration.\n2. Create a multi-stage Dockerfile: install dependencies, generate Prisma, and build in the builder stage.\n3. Copy the standalone server, static assets, and public assets into a Node.js runtime image.\n4. Configure `HOSTNAME=0.0.0.0` and provide secrets through your deployment platform.\n5. Run database migrations as a separate release task before starting the service.\n\n```bash\n# After authoring your Dockerfile\ndocker build -t storefront .\ndocker run --env-file .env.production -p 3000:3000 storefront\n```",
    aws: "## Host the sample storefront on AWS\n\n1. Build a production container and publish it to **Amazon ECR**.\n2. Provision PostgreSQL in RDS and restrict access to your application network.\n3. Create an ECS Fargate service with an Application Load Balancer.\n4. Inject database, Clerk, and Stripe credentials through AWS Secrets Manager.\n5. Run migrations as a release task, configure health checks, and connect your HTTPS domain.\n\nThis is a planning outline; exact networking, IAM roles, sizing, and infrastructure depend on your deployment requirements.",
  };
  return (
    <Panel
      title="Your launch checklist"
      icon={Rocket}
      action={
        <span className="text-[10px] text-zinc-500">Illustrative guide</span>
      }
    >
      <div className="flex flex-wrap gap-2 border-b border-white/8 px-6 py-4">
        {(["vercel", "docker", "aws"] as const).map((value) => (
          <Button
            variant={target === value ? "default" : "outline"}
            size="sm"
            key={value}
            onClick={() => setTarget(value)}
          >
            {value === "vercel" ? (
              <span className="text-xs">▲</span>
            ) : value === "docker" ? (
              <Boxes />
            ) : (
              <Terminal />
            )}
            {value === "aws"
              ? "AWS"
              : value.charAt(0).toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </div>
      <div className="max-w-[820px] p-6 sm:p-9">
        <p className="mb-6 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] p-3 text-[11px] leading-5 text-zinc-500">
          Sample checklist for the fictional storefront. Custom deployment
          generation and one-click deployment are not connected.
        </p>
        <Markdown>{guides[target]}</Markdown>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() =>
            downloadText(`storefront-deploy-${target}.md`, guides[target])
          }
        >
          <ArrowDownToLine />
          Download guide
        </Button>
      </div>
    </Panel>
  );
}
