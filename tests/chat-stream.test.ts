import test from "node:test";
import assert from "node:assert/strict";
import { consumeChatStream } from "../src/lib/chat-stream.ts";

test("stream decoder handles split UTF-8 bytes and split event boundaries", async () => {
  const bytes = new TextEncoder().encode(
    '{"type":"delta","text":"Hi 👋"}\n{"type":"done","id":"1"}\n',
  );
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3)
        controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  });
  let text = "";
  await consumeChatStream(body, (event) => {
    if (event.type === "delta") text += event.text;
  });
  assert.equal(text, "Hi 👋");
});
test("interrupted streams and server errors are never treated as completed answers", async () => {
  await assert.rejects(
    consumeChatStream(
      new Response('{"type":"delta","text":"partial"}\n').body!,
      () => {},
    ),
    /interrupted/,
  );
  await assert.rejects(
    consumeChatStream(
      new Response('{"type":"error","error":"provider unavailable"}\n').body!,
      () => {},
    ),
    /provider unavailable/,
  );
});
