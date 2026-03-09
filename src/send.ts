import type { YunjiaChatSdkInstance } from "./types.js";

const YUNJIA_CHAT_EVENT = "com.inspur.ecm.chat";

export type ParsedYunjiaTarget =
  | { kind: "user"; userId: string }
  | { kind: "group"; channelId: string }
  | { kind: "direct"; channelId: string };

export type YunjiaDynamicMarkdownStreamStatus = "start" | "continue" | "end";

export type YunjiaDynamicMarkdownChunk = {
  channelId: string;
  parent: string;
  roundId: string;
  sessionId: string;
  streamId: string;
  chunk: string;
  chunkIndex: number;
  streamStatus: YunjiaDynamicMarkdownStreamStatus;
  enterprise?: string;
  tracer?: string;
};

function buildDynamicMarkdownEventPayload(params: YunjiaDynamicMarkdownChunk): {
  headers: { enterprise?: string; tracer?: string };
  action: { method: "post"; path: string };
  body: {
    type: "agent/dynamic-markdown";
    parent: string;
    roundId: string;
    sessionId: string;
    streamId: string;
    chunk: string;
    chunkIndex: number;
    streamStatus: YunjiaDynamicMarkdownStreamStatus;
  };
} {
  return {
    headers: {
      ...(params.enterprise ? { enterprise: params.enterprise } : {}),
      ...(params.tracer ? { tracer: params.tracer } : {}),
    },
    action: {
      method: "post",
      path: `/channel/${params.channelId}/message`,
    },
    body: {
      type: "agent/dynamic-markdown",
      parent: params.parent,
      roundId: params.roundId,
      sessionId: params.sessionId,
      streamId: params.streamId,
      chunk: params.chunk,
      chunkIndex: params.chunkIndex,
      streamStatus: params.streamStatus,
    },
  };
}

type CallableRecord = Record<string, (...args: unknown[]) => unknown>;

async function callTransportWithVariants(params: {
  target: unknown;
  method: string;
  argVariants: unknown[][];
}): Promise<"sent" | "unsupported"> {
  if (!params.target || typeof params.target !== "object") {
    return "unsupported";
  }
  const callable = (params.target as CallableRecord)[params.method];
  if (typeof callable !== "function") {
    return "unsupported";
  }

  let lastError: unknown;
  for (const args of params.argVariants) {
    try {
      const result = await Promise.resolve(callable.apply(params.target, args));
      // EventEmitter.emit() returns false when no listeners are attached.
      if (result === false) {
        continue;
      }
      return "sent";
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  return "unsupported";
}

export async function sendDynamicMarkdownChunkToYunjia(params: {
  sdk: YunjiaChatSdkInstance;
  chunk: YunjiaDynamicMarkdownChunk;
}): Promise<boolean> {
  const payload = buildDynamicMarkdownEventPayload(params.chunk);
  const eventTuple: [string, typeof payload] = [YUNJIA_CHAT_EVENT, payload];
  const argVariants: unknown[][] = [
    [YUNJIA_CHAT_EVENT, payload],
    [eventTuple],
    [payload],
    [[YUNJIA_CHAT_EVENT, payload]],
  ];

  const sdkRecord = params.sdk as unknown as Record<string, unknown>;
  const socketCandidate = sdkRecord.socket;
  const attempts: Array<{ target: unknown; method: string }> = [];
  if (socketCandidate && typeof socketCandidate === "object") {
    attempts.push({ target: socketCandidate, method: "emit" });
  }
  attempts.push(
    { target: params.sdk, method: "sendMessage" },
    { target: params.sdk, method: "send" },
    { target: params.sdk, method: "publish" },
    { target: params.sdk, method: "emit" },
  );

  for (const attempt of attempts) {
    const sent = await callTransportWithVariants({
      target: attempt.target,
      method: attempt.method,
      argVariants,
    });
    if (sent === "sent") {
      return true;
    }
  }
  return false;
}

export function normalizeYunjiaMessagingTarget(target: string): string | undefined {
  const trimmed = target.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^yunjia:/i, "");
}

export function looksLikeYunjiaTarget(target: string): boolean {
  const normalized = normalizeYunjiaMessagingTarget(target);
  if (!normalized) {
    return false;
  }

  if (/^(user|group|channel|direct):/i.test(normalized)) {
    return true;
  }

  return /^[A-Za-z0-9_:@.-]{3,}$/.test(normalized);
}

export function parseYunjiaTarget(target: string): ParsedYunjiaTarget {
  const normalized = normalizeYunjiaMessagingTarget(target);
  if (!normalized) {
    throw new Error("Yunjia target cannot be empty");
  }

  if (/^user:/i.test(normalized)) {
    const userId = normalized.replace(/^user:/i, "").trim();
    if (!userId) {
      throw new Error("Yunjia user target is empty");
    }
    return { kind: "user", userId };
  }

  if (/^(group|channel):/i.test(normalized)) {
    const channelId = normalized.replace(/^(group|channel):/i, "").trim();
    if (!channelId) {
      throw new Error("Yunjia group target is empty");
    }
    return { kind: "group", channelId };
  }

  if (/^direct:/i.test(normalized)) {
    const channelId = normalized.replace(/^direct:/i, "").trim();
    if (!channelId) {
      throw new Error("Yunjia direct target is empty");
    }
    return { kind: "direct", channelId };
  }

  return { kind: "direct", channelId: normalized };
}

export async function sendTextToYunjia(params: {
  sdk: YunjiaChatSdkInstance;
  target: string;
  text: string;
  enterpriseId?: string;
}): Promise<{ channelId: string; mode: ParsedYunjiaTarget["kind"] }> {
  const parsed = parseYunjiaTarget(params.target);

  switch (parsed.kind) {
    case "user": {
      const conversation = await params.sdk.createDirectChannel(parsed.userId);
      if (!conversation?.id) {
        throw new Error(`Unable to create direct channel for Yunjia user ${parsed.userId}`);
      }
      params.sdk.sendTextDirect({
        channelId: conversation.id,
        text: params.text,
        enterpriseId: params.enterpriseId,
      });
      return { channelId: conversation.id, mode: "user" };
    }

    case "group": {
      params.sdk.sendTextGroup({
        channelId: parsed.channelId,
        text: params.text,
        enterpriseId: params.enterpriseId,
      });
      return { channelId: parsed.channelId, mode: "group" };
    }

    case "direct": {
      params.sdk.sendTextDirect({
        channelId: parsed.channelId,
        text: params.text,
        enterpriseId: params.enterpriseId,
      });
      return { channelId: parsed.channelId, mode: "direct" };
    }
  }
}

export async function sendReplyToYunjiaChannel(params: {
  sdk: YunjiaChatSdkInstance;
  chatType: "direct" | "group";
  channelId: string;
  text: string;
  enterpriseId?: string;
}): Promise<void> {
  const target =
    params.chatType === "group" ? `group:${params.channelId}` : `direct:${params.channelId}`;
  await sendTextToYunjia({
    sdk: params.sdk,
    target,
    text: params.text,
    enterpriseId: params.enterpriseId,
  });
}
