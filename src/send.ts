import type { YunjiaChatSdkInstance } from "./types.js";

export type ParsedYunjiaTarget =
  | { kind: "user"; userId: string }
  | { kind: "group"; channelId: string }
  | { kind: "direct"; channelId: string };

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
