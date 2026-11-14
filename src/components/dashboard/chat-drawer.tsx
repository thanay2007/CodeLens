"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  Bot,
  CornerDownLeft,
  LoaderCircle,
  Plus,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { demoQuestions, getDemoAnswer } from "@/lib/demo";
import { consumeChatStream } from "@/lib/chat-stream";
import type { ChatMessage } from "@/lib/types";
import { Markdown } from "./markdown";

export function ChatDrawer({
  open,
  onOpenChange,
  repositoryId,
  repositoryName,
  ready,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryId: string | null;
  repositoryName: string;
  ready: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(Boolean(repositoryId));
  const bottom = useRef<HTMLDivElement>(null),
    request = useRef<AbortController | null>(null);
  const reduceMotion = useReducedMotion(),
    demo = !repositoryId;
  useEffect(() => {
    if (!repositoryId) return;
    const controller = new AbortController();
    fetch(`/api/chat?repositoryId=${encodeURIComponent(repositoryId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setMessages(result.messages);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [repositoryId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: reduceMotion ? "instant" : "smooth",
    });
  }, [messages, pending, reduceMotion]);

  async function send(value: string) {
    const text = value.trim();
    if (!text || pending || historyLoading || (!demo && !ready)) return;
    setQuestion("");
    setError("");
    setPending(true);
    const userId = crypto.randomUUID(),
      answerId = crypto.randomUUID();
    setMessages((previous) => [
      ...previous,
      { id: userId, role: "user", content: text },
      { id: answerId, role: "assistant", content: "" },
    ]);
    if (demo) {
      setMessages((previous) =>
        previous.map((message) =>
          message.id === answerId
            ? { ...message, content: getDemoAnswer(text) }
            : message,
        ),
      );
      setPending(false);
      return;
    }
    request.current = new AbortController();
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId, question: text }),
        signal: request.current.signal,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "The assistant is unavailable.");
      }
      if (!response.body) throw new Error("The answer stream was unavailable.");
      await consumeChatStream(response.body, (event) => {
        setMessages((previous) =>
          previous.map((message) =>
            message.id !== answerId
              ? message
              : event.type === "delta"
                ? { ...message, content: message.content + event.text }
                : event.type === "sources"
                  ? { ...message, sources: event.sources }
                  : message,
          ),
        );
      });
    } catch (err) {
      setError(
        (err as Error).name === "AbortError"
          ? "Generation stopped. The partial answer was not saved."
          : (err as Error).message,
      );
    } finally {
      setPending(false);
    }
  }
  async function reset() {
    if (pending) return;
    if (repositoryId) {
      try {
        const response = await fetch("/api/chat/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repositoryId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }
    setMessages([]);
    setError("");
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content forceMount asChild>
              <motion.section
                initial={{ x: reduceMotion ? 0 : "100%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: reduceMotion ? 0 : "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 32, stiffness: 280 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[470px] flex-col border-l border-white/10 bg-[#0e0e13] shadow-2xl focus:outline-none"
              >
                <header className="flex items-center gap-3 border-b border-white/8 px-5 py-5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                    <Sparkles size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="text-sm font-semibold">
                      CodeLens Assistant
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 truncate text-xs text-zinc-500">
                      {repositoryName} ·{" "}
                      {demo ? "Demo conversation" : "Source-grounded answers"}
                    </Dialog.Description>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="New conversation"
                    disabled={pending || historyLoading}
                    onClick={reset}
                  >
                    <Plus />
                  </Button>
                  <Dialog.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Close assistant"
                    >
                      <X />
                    </Button>
                  </Dialog.Close>
                </header>
                <div className="flex-1 overflow-y-auto px-5 py-6">
                  {historyLoading ? (
                    <div
                      role="status"
                      className="flex items-center gap-2 py-8 text-xs text-zinc-500"
                    >
                      <LoaderCircle className="size-4 animate-spin" />
                      Loading saved conversation…
                    </div>
                  ) : (
                    messages.length === 0 && (
                      <div className="flex min-h-full flex-col justify-center pb-10">
                        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                          <Bot size={25} />
                        </div>
                        <h2 className="text-2xl font-semibold tracking-tight">
                          Meet your codebase.
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-zinc-400">
                          {demo
                            ? "Try a sample question to explore the fictional storefront."
                            : ready
                              ? "Ask about architecture, data flows, or implementation details. Answers cite the inspected source snapshot."
                              : "This snapshot needs Groq and a completed Pinecone index before the assistant can answer. Configure the integrations, then reanalyze the repository."}
                        </p>
                        <div className="mt-7 space-y-2">
                          {demoQuestions.map((value) => (
                            <button
                              key={value}
                              disabled={!demo && !ready}
                              onClick={() => send(value)}
                              className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-left text-xs leading-5 text-zinc-300 transition hover:border-violet-400/30 disabled:opacity-40"
                            >
                              {value}
                              <CornerDownLeft
                                size={13}
                                className="shrink-0 text-zinc-600"
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                  <div
                    role="log"
                    aria-label="Conversation"
                    aria-live="polite"
                    className="space-y-6"
                  >
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={
                          message.role === "user"
                            ? "ml-9 rounded-2xl rounded-tr-sm border border-white/5 bg-white/[0.055] px-4 py-3 text-sm leading-6 text-zinc-200"
                            : "mr-2"
                        }
                      >
                        {message.role === "assistant" && (
                          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-violet-300">
                            <Sparkles size={13} />
                            CodeLens
                            <span className="text-[10px] font-normal text-zinc-600">
                              {demo ? "PRESET DEMO" : "RETRIEVED CONTEXT"}
                            </span>
                          </div>
                        )}
                        {message.role === "assistant" ? (
                          <>
                            <Markdown>{message.content}</Markdown>
                            {Boolean(message.sources?.length) && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {message.sources?.map((source) => (
                                  <a
                                    key={source.id}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded border border-violet-400/15 bg-violet-400/5 px-2 py-1 font-mono text-[9px] text-violet-300 hover:bg-violet-400/10"
                                  >
                                    [{source.id}] {source.path}:
                                    {source.startLine}-{source.endLine}
                                  </a>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          message.content
                        )}
                      </div>
                    ))}
                    {pending && (
                      <div
                        role="status"
                        className="flex items-center gap-2 text-xs text-zinc-500"
                      >
                        <LoaderCircle className="size-3.5 animate-spin text-violet-400" />
                        Retrieving and answering from source…
                      </div>
                    )}
                  </div>
                  <div ref={bottom} />
                </div>
                <footer className="border-t border-white/8 bg-[#111116] p-4">
                  {error && (
                    <p
                      role="alert"
                      className="mb-3 text-xs leading-5 text-rose-300"
                    >
                      {error}
                    </p>
                  )}
                  <form
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault();
                      send(question);
                    }}
                    className="flex items-end gap-2 rounded-xl border border-white/10 bg-[#18181f] p-2 focus-within:border-violet-400/50"
                  >
                    <textarea
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          send(question);
                        }
                      }}
                      disabled={!demo && !ready}
                      rows={2}
                      maxLength={2000}
                      placeholder="Ask about this codebase…"
                      aria-label="Message to CodeLens"
                      className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-zinc-600 disabled:opacity-40"
                    />
                    {pending ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label="Stop generation"
                        className="size-8"
                        onClick={() => request.current?.abort()}
                      >
                        <Square className="!size-3" />
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        size="icon"
                        disabled={
                          !question.trim() ||
                          historyLoading ||
                          (!demo && !ready)
                        }
                        aria-label="Send message"
                        className="size-8"
                      >
                        <ArrowUp />
                      </Button>
                    )}
                  </form>
                  <p className="mt-3 text-center text-[10px] leading-4 text-zinc-500">
                    {demo
                      ? "Sample answers only. Select an indexed repository for live chat."
                      : "Answers can be incomplete. Check the linked source before making changes."}
                  </p>
                </footer>
              </motion.section>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
