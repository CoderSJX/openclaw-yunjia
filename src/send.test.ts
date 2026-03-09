import { describe, expect, it, vi } from "vitest";
import {
  looksLikeYunjiaTarget,
  normalizeYunjiaMessagingTarget,
  parseYunjiaTarget,
  sendDynamicMarkdownChunkToYunjia,
  sendTextToYunjia,
} from "./send.js";
import type { YunjiaChatSdkInstance } from "./types.js";

describe("yunjia send helpers", () => {
  it("normalizes yunjia prefix", () => {
    expect(normalizeYunjiaMessagingTarget("yunjia:user:1001")).toBe("user:1001");
  });

  it("parses target prefixes", () => {
    expect(parseYunjiaTarget("user:123")).toEqual({ kind: "user", userId: "123" });
    expect(parseYunjiaTarget("group:abc")).toEqual({ kind: "group", channelId: "abc" });
    expect(parseYunjiaTarget("direct:xyz")).toEqual({ kind: "direct", channelId: "xyz" });
    expect(parseYunjiaTarget("room-1")).toEqual({ kind: "direct", channelId: "room-1" });
  });

  it("recognizes candidate targets", () => {
    expect(looksLikeYunjiaTarget("user:123")).toBe(true);
    expect(looksLikeYunjiaTarget("group:abc")).toBe(true);
    expect(looksLikeYunjiaTarget("  ")).toBe(false);
  });

  it("routes user target through createDirectChannel", async () => {
    const createDirectChannel = vi.fn().mockResolvedValue({ id: "direct-42" });
    const sendTextDirect = vi.fn();

    const sdk = {
      on: vi.fn(),
      initialize: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      close: vi.fn(),
      getSession: vi.fn(),
      createDirectChannel,
      sendTextDirect,
      sendTextGroup: vi.fn(),
    } as unknown as YunjiaChatSdkInstance;

    const result = await sendTextToYunjia({
      sdk,
      target: "user:u100",
      text: "hello",
      enterpriseId: "tenant-a",
    });

    expect(createDirectChannel).toHaveBeenCalledWith("u100");
    expect(sendTextDirect).toHaveBeenCalledWith({
      channelId: "direct-42",
      text: "hello",
      enterpriseId: "tenant-a",
    });
    expect(result).toEqual({ channelId: "direct-42", mode: "user" });
  });

  it("sends dynamic markdown chunks through socket emit transport", async () => {
    const emit = vi.fn().mockReturnValue({ ok: true });
    const sdk = {
      socket: { emit },
    } as unknown as YunjiaChatSdkInstance;

    const sent = await sendDynamicMarkdownChunkToYunjia({
      sdk,
      chunk: {
        channelId: "1234567890",
        parent: "866271940418076666",
        roundId: "round-1",
        sessionId: "session-1",
        streamId: "stream-1",
        chunk: "hello",
        chunkIndex: 1,
        streamStatus: "continue",
        enterprise: "9991",
        tracer: "trace-1",
      },
    });

    expect(sent).toBe(true);
    expect(emit).toHaveBeenCalledWith("com.inspur.ecm.chat", {
      headers: { enterprise: "9991", tracer: "trace-1" },
      action: { method: "post", path: "/channel/1234567890/message" },
      body: {
        type: "agent/dynamic-markdown",
        parent: "866271940418076666",
        roundId: "round-1",
        sessionId: "session-1",
        streamId: "stream-1",
        chunk: "hello",
        chunkIndex: 1,
        streamStatus: "continue",
      },
    });
  });

  it("returns false when sdk has no compatible dynamic markdown transport", async () => {
    const sent = await sendDynamicMarkdownChunkToYunjia({
      sdk: {} as YunjiaChatSdkInstance,
      chunk: {
        channelId: "123",
        parent: "parent",
        roundId: "round",
        sessionId: "session",
        streamId: "stream",
        chunk: "",
        chunkIndex: 0,
        streamStatus: "start",
      },
    });
    expect(sent).toBe(false);
  });
});
