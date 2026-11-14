import type { ChatSource } from "./types";

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "sources"; sources: ChatSource[] }
  | { type: "done"; id: string }
  | { type: "error"; error: string };

export async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatEvent) => void,
) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    doneEvent = false;
  const line = (value: string) => {
    if (!value.trim()) return;
    const event = JSON.parse(value) as ChatEvent;
    if (event.type === "done") doneEvent = true;
    if (event.type === "error") throw new Error(event.error);
    onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      if (pending.length > 128000)
        throw new Error("The streamed answer is too large.");
      let end;
      while ((end = pending.indexOf("\n")) >= 0) {
        line(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) line(pending);
    if (!doneEvent)
      throw new Error("The answer was interrupted. Please retry.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
