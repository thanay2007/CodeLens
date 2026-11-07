"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Bot, CornerDownLeft, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { demoQuestions, getDemoAnswer } from "@/lib/demo";
import { Markdown } from "./markdown";

type Message = { id: number; role: "user" | "assistant"; content: string };

export function ChatDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: reduceMotion ? "instant" : "smooth",
    });
  }, [messages, pending, reduceMotion]);

  function send(value: string) {
    const text = value.trim();
    if (!text || pending) return;
    setQuestion("");
    setMessages((previous) => [
      ...previous,
      { id: Date.now(), role: "user", content: text },
    ]);
    setPending(true);
    timer.current = setTimeout(() => {
      setMessages((previous) => [
        ...previous,
        { id: Date.now() + 1, role: "assistant", content: getDemoAnswer(text) },
      ]);
      setPending(false);
    }, 550);
  }

  function reset() {
    if (timer.current) clearTimeout(timer.current);
    setMessages([]);
    setPending(false);
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
                  <div className="flex size-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                    <Sparkles size={20} />
                  </div>
                  <div className="flex-1">
                    <Dialog.Title className="text-sm font-semibold">
                      CodeLens Assistant
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-xs text-zinc-500">
                      acme/storefront · Demo conversation
                    </Dialog.Description>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="New conversation"
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
                  {messages.length === 0 && (
                    <div className="flex min-h-full flex-col justify-center pb-10">
                      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                        <Bot size={25} />
                      </div>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        Meet your codebase.
                      </h2>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">
                        From the big picture to the smallest function. Try a
                        sample question to explore the demo.
                      </p>
                      <div className="mt-7 space-y-2">
                        {demoQuestions.map((q) => (
                          <button
                            key={q}
                            onClick={() => send(q)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-left text-xs leading-5 text-zinc-300 transition hover:border-violet-400/30 hover:bg-violet-500/5"
                          >
                            {q}
                            <CornerDownLeft
                              size={13}
                              className="shrink-0 text-zinc-600"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
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
                            CodeLens{" "}
                            <span className="text-[10px] font-normal text-zinc-600">
                              PRESET DEMO
                            </span>
                          </div>
                        )}
                        {message.role === "assistant" ? (
                          <Markdown>{message.content}</Markdown>
                        ) : (
                          message.content
                        )}
                      </div>
                    ))}
                    {pending && (
                      <div
                        role="status"
                        className="flex items-center gap-1.5 text-xs text-violet-300"
                      >
                        <span className="size-1.5 animate-pulse rounded-full bg-violet-400" />
                        <span className="size-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:150ms]" />
                        <span className="size-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:300ms]" />
                        <span className="ml-2 text-zinc-500">
                          Preparing demo response
                        </span>
                      </div>
                    )}
                  </div>
                  <div ref={bottom} />
                </div>
                <footer className="border-t border-white/8 bg-[#111116] p-4">
                  <form
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault();
                      send(question);
                    }}
                    className="flex items-end gap-2 rounded-xl border border-white/10 bg-[#18181f] p-2 focus-within:border-violet-400/50"
                  >
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          send(question);
                        }
                      }}
                      rows={2}
                      maxLength={2000}
                      placeholder="Ask about this codebase…"
                      aria-label="Message to CodeLens"
                      className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-zinc-600"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!question.trim() || pending}
                      aria-label="Send message"
                      className="size-8"
                    >
                      <ArrowUp />
                    </Button>
                  </form>
                  <p className="mt-3 text-center text-[10px] leading-4 text-zinc-500">
                    Sample answers only. Live RAG and Groq streaming are not
                    connected.
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
