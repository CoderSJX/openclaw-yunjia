import { describe, expect, it, vi } from "vitest";
import {
  looksLikeYunjiaTarget,
  normalizeYunjiaMessagingTarget,
  parseYunjiaTarget,
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
});
