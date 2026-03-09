import { randomUUID } from "node:crypto";
import {
  createReplyPrefixOptions,
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  missingTargetError,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  type ChannelAccountSnapshot,
  type ChannelPlugin,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import {
  isYunjiaAccountConfigured,
  listYunjiaAccountIds,
  resolveYunjiaAccount,
} from "./accounts.js";
import { yunjiaChannelConfigSchema } from "./config-schema.js";
import { getYunjiaRuntime } from "./runtime.js";
import { createYunjiaSdkClient } from "./sdk-loader.js";
import {
  looksLikeYunjiaTarget,
  normalizeYunjiaMessagingTarget,
  sendAgentStreamChunkToYunjia,
  sendReplyToYunjiaChannel,
  sendTextToYunjia,
} from "./send.js";
import type {
  ResolvedYunjiaAccount,
  YunjiaChatSdkInstance,
  YunjiaInboundMessage,
} from "./types.js";

const CHANNEL_ID = "yunjia";
const CHANNEL_META = {
  id: CHANNEL_ID,
  label: "Yunjia Chat",
  selectionLabel: "Yunjia Chat (Socket)",
  detailLabel: "Yunjia Chat",
  docsPath: "/channels/yunjia",
  docsLabel: "yunjia",
  blurb: "Connect Yunjia chat service to OpenClaw through the official SDK.",
  order: 92,
} as const;

const activeClients = new Map<string, YunjiaChatSdkInstance>();

function resolveRuntimeAccountId(accountId?: string | null): string {
  const normalized = accountId?.trim();
  return normalized || DEFAULT_ACCOUNT_ID;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseCreatedAt(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (!value) {
    return undefined;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return undefined;
}

function resolveInboundText(message: YunjiaInboundMessage): string {
  const text =
    message.body?.content?.text ?? message.body?.content?.message ?? message.body?.message ?? "";
  return String(text).trim();
}

function resolveInboundChannelId(message: YunjiaInboundMessage): string {
  return String(message.body?.channel ?? "").trim();
}

function resolveInboundChatType(message: YunjiaInboundMessage): "direct" | "group" {
  const channelType = message.body?.content?.channelType?.toUpperCase();
  return channelType === "GROUP" ? "group" : "direct";
}

function isSelfInboundMessage(sdk: YunjiaChatSdkInstance, message: YunjiaInboundMessage): boolean {
  const selfUid = String(sdk.getSession().uid ?? "").trim();
  if (!selfUid) {
    return false;
  }
  const senderId = String(message.body?.from?.user ?? message.body?.from?.id ?? "").trim();
  if (!senderId) {
    return false;
  }
  return senderId === selfUid;
}

function toSdkLogger(
  accountId: string,
  log?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  },
): {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
} {
  const format = (args: unknown[]) => args.map((part) => String(part)).join(" ");
  return {
    debug: (...args: unknown[]) => log?.debug?.(`[${accountId}] ${format(args)}`),
    info: (...args: unknown[]) => log?.info?.(`[${accountId}] ${format(args)}`),
    warn: (...args: unknown[]) => log?.warn?.(`[${accountId}] ${format(args)}`),
    error: (...args: unknown[]) => log?.error?.(`[${accountId}] ${format(args)}`),
  };
}

async function closeActiveClient(accountId: string): Promise<void> {
  const existing = activeClients.get(accountId);
  if (!existing) {
    return;
  }
  activeClients.delete(accountId);
  existing.close();
}

function requireRunningClient(accountId?: string | null): YunjiaChatSdkInstance {
  const resolvedAccountId = resolveRuntimeAccountId(accountId);
  const sdk = activeClients.get(resolvedAccountId);
  if (!sdk || !sdk.isConnected()) {
    throw new Error(
      `Yunjia account ${resolvedAccountId} is not connected. Run the gateway before sending messages.`,
    );
  }
  return sdk;
}

async function processInboundMessage(params: {
  message: YunjiaInboundMessage;
  cfg: OpenClawConfig;
  account: ResolvedYunjiaAccount;
  accountId: string;
  setStatus: (patch: Partial<ChannelAccountSnapshot>) => void;
  log?: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  };
}): Promise<void> {
  const { message, cfg, account, accountId, setStatus, log } = params;
  const runtime = getYunjiaRuntime();

  const channelId = resolveInboundChannelId(message);
  const senderId = String(message.body?.from?.user ?? message.body?.from?.id ?? "").trim();
  const senderNameSource = message.body?.from?.name ?? senderId;
  const senderName = String(senderNameSource || "unknown").trim();
  const rawText = resolveInboundText(message);

  if (!channelId || !senderId || !rawText) {
    return;
  }

  const chatType = resolveInboundChatType(message);
  const peer =
    chatType === "group"
      ? ({ kind: "group", id: channelId } as const)
      : ({ kind: "direct", id: senderId } as const);

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: CHANNEL_ID,
    accountId,
    peer,
  });

  const createdAt = parseCreatedAt(message.body?.creationDate);
  const bodyWithEnvelope = runtime.channel.reply.formatAgentEnvelope({
    channel: "Yunjia",
    from: senderName,
    timestamp: createdAt,
    envelope: runtime.channel.reply.resolveEnvelopeFormatOptions(cfg),
    body: rawText,
  });

  const inboundContext = runtime.channel.reply.finalizeInboundContext({
    Body: bodyWithEnvelope,
    BodyForAgent: rawText,
    RawBody: rawText,
    CommandBody: rawText,
    From: `yunjia:user:${senderId}`,
    To: `yunjia:channel:${channelId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: chatType,
    ConversationLabel: channelId,
    SenderName: senderName,
    SenderId: senderId,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: message.body?.id,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `yunjia:${channelId}`,
  });

  const storePath = runtime.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });

  void runtime.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: inboundContext.SessionKey ?? route.sessionKey,
      ctx: inboundContext,
    })
    .catch((error) => {
      log?.warn?.(`Failed to record inbound session meta: ${String(error)}`);
    });

  setStatus({ lastInboundAt: Date.now(), lastError: null });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: route.accountId,
  });

  const parentId = normalizeOptionalString(message.body?.id) ?? `${channelId}-${Date.now()}`;
  const roundId = normalizeOptionalString(message.body?.roundId) ?? parentId;
  const sessionId = normalizeOptionalString(message.body?.sessionId) ?? route.sessionKey;
  const enterprise = normalizeOptionalString(message.headers?.enterprise) ?? account.tenantId;
  const incomingTracer = normalizeOptionalString(message.headers?.tracer);

  type StreamLane = "answer" | "thinking";
  type StreamState = {
    mode: "dynamic-markdown" | "plain-text";
    started: boolean;
    chunkIndex: number;
    streamId: string;
  };

  const createStreamState = (): StreamState => ({
    mode: "dynamic-markdown",
    started: false,
    chunkIndex: 0,
    streamId: randomUUID(),
  });
  const streams: Record<StreamLane, StreamState> = {
    answer: createStreamState(),
    thinking: createStreamState(),
  };

  const sendFallbackText = async (replyText: string) => {
    const sdk = requireRunningClient(accountId);
    await sendReplyToYunjiaChannel({
      sdk,
      channelId,
      chatType,
      text: replyText,
      enterpriseId: account.tenantId,
    });
  };

  const sendStreamChunk = async (lane: StreamLane, replyText: string) => {
    const state = streams[lane];
    const streamType = lane === "thinking" ? "agent/thinking" : "agent/dynamic-markdown";
    if (state.mode === "plain-text") {
      await sendFallbackText(replyText);
      return;
    }

    const sdk = requireRunningClient(accountId);
    const outboundUserId = normalizeOptionalString(sdk.getSession().uid);
    if (!state.started) {
      const sentStart = await sendAgentStreamChunkToYunjia({
        sdk,
        chunk: {
          type: streamType,
          channelId,
          parent: parentId,
          roundId,
          sessionId,
          streamId: state.streamId,
          chunk: "",
          chunkIndex: 0,
          streamStatus: "start",
          enterprise,
          tracer: incomingTracer ?? state.streamId,
          toUserId: chatType === "direct" ? senderId : undefined,
          fromUserId: outboundUserId,
        },
      });
      if (!sentStart) {
        state.mode = "plain-text";
        await sendFallbackText(replyText);
        return;
      }
      state.started = true;
    }

    state.chunkIndex += 1;
    const sentChunk = await sendAgentStreamChunkToYunjia({
      sdk,
      chunk: {
        type: streamType,
        channelId,
        parent: parentId,
        roundId,
        sessionId,
        streamId: state.streamId,
        chunk: replyText,
        chunkIndex: state.chunkIndex,
        streamStatus: "continue",
        enterprise,
        tracer: incomingTracer ?? state.streamId,
        toUserId: chatType === "direct" ? senderId : undefined,
        fromUserId: outboundUserId,
      },
    });
    if (!sentChunk) {
      state.mode = "plain-text";
      await sendFallbackText(replyText);
    }
  };

  const endStream = async (lane: StreamLane) => {
    const state = streams[lane];
    if (state.mode !== "dynamic-markdown" || !state.started) {
      return;
    }
    const sdk = requireRunningClient(accountId);
    const outboundUserId = normalizeOptionalString(sdk.getSession().uid);
    const streamType = lane === "thinking" ? "agent/thinking" : "agent/dynamic-markdown";
    const sentEnd = await sendAgentStreamChunkToYunjia({
      sdk,
      chunk: {
        type: streamType,
        channelId,
        parent: parentId,
        roundId,
        sessionId,
        streamId: state.streamId,
        chunk: "",
        chunkIndex: state.chunkIndex,
        streamStatus: "end",
        enterprise,
        tracer: incomingTracer ?? state.streamId,
        toUserId: chatType === "direct" ? senderId : undefined,
        fromUserId: outboundUserId,
      },
    });
    if (!sentEnd) {
      state.mode = "plain-text";
    }
    state.started = false;
    state.chunkIndex = 0;
    state.streamId = randomUUID();
  };

  await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: inboundContext,
    cfg,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        const replyText = payload.text ?? "";
        if (!replyText.trim()) {
          return;
        }
        try {
          await sendStreamChunk("answer", replyText);
        } catch (error) {
          streams.answer.mode = "plain-text";
          log?.warn?.(`Yunjia dynamic markdown stream failed, fallback to text: ${String(error)}`);
          await sendFallbackText(replyText);
        }
        setStatus({ lastOutboundAt: Date.now(), lastError: null });
      },
      onError: (error, info) => {
        log?.error?.(`Yunjia ${info.kind} reply failed: ${String(error)}`);
      },
    },
    replyOptions: {
      onModelSelected,
      onReasoningStream: async (payload) => {
        const thinkingText = payload.text ?? "";
        if (!thinkingText.trim()) {
          return;
        }
        try {
          await sendStreamChunk("thinking", thinkingText);
          setStatus({ lastOutboundAt: Date.now(), lastError: null });
        } catch (error) {
          streams.thinking.mode = "plain-text";
          log?.warn?.(
            `Yunjia thinking dynamic markdown stream failed, fallback to text: ${String(error)}`,
          );
          await sendFallbackText(thinkingText);
          setStatus({ lastOutboundAt: Date.now(), lastError: null });
        }
      },
      onReasoningEnd: async () => {
        try {
          await endStream("thinking");
        } catch (error) {
          log?.warn?.(`Yunjia thinking dynamic markdown stream end failed: ${String(error)}`);
        }
      },
    },
  });

  for (const lane of ["thinking", "answer"] as const) {
    try {
      await endStream(lane);
    } catch (error) {
      log?.warn?.(`Yunjia ${lane} dynamic markdown stream end failed: ${String(error)}`);
    }
  }
}

export const yunjiaPlugin: ChannelPlugin<ResolvedYunjiaAccount> = {
  id: CHANNEL_ID,

  meta: {
    ...CHANNEL_META,
  },

  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    threads: false,
    reactions: false,
    edit: false,
    unsend: false,
    reply: false,
    effects: false,
    blockStreaming: false,
  },

  reload: {
    configPrefixes: ["channels.yunjia"],
  },
  configSchema: yunjiaChannelConfigSchema,

  config: {
    listAccountIds: (cfg) => listYunjiaAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveYunjiaAccount(cfg, accountId),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: CHANNEL_ID,
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    isConfigured: (account) => isYunjiaAccountConfigured(account),
    describeAccount: (account, cfg) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: isYunjiaAccountConfigured(account),
      connected:
        activeClients.get(account.accountId)?.isConnected() ??
        activeClients.get(DEFAULT_ACCOUNT_ID)?.isConnected() ??
        false,
      dmPolicy: account.dmPolicy,
      allowFrom: account.allowFrom,
      baseUrl: account.idmBaseUrl || undefined,
      credentialSource: account.accessToken ? "token" : account.username ? "password" : "none",
      mode: account.socketIoMode,
      linked: isYunjiaAccountConfigured(account),
      running: Boolean(activeClients.get(account.accountId)),
    }),
    resolveAllowFrom: ({ cfg, accountId }) => resolveYunjiaAccount(cfg, accountId).allowFrom,
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean),
    resolveDefaultTo: ({ cfg, accountId }) => resolveYunjiaAccount(cfg, accountId).defaultTo,
  },

  pairing: {
    idLabel: "yunjiaUserId",
    normalizeAllowEntry: (entry) =>
      entry
        .trim()
        .replace(/^yunjia:/i, "")
        .replace(/^user:/i, "")
        .toLowerCase(),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveYunjiaAccount(cfg, DEFAULT_ACCOUNT_ID);
      const sdk = activeClients.get(account.accountId);
      if (!sdk || !sdk.isConnected()) {
        return;
      }
      await sendTextToYunjia({
        sdk,
        target: `user:${id}`,
        text: PAIRING_APPROVED_MESSAGE,
        enterpriseId: account.tenantId,
      });
    },
  },

  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.yunjia?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.yunjia.accounts.${resolvedAccountId}.`
        : "channels.yunjia.";

      return {
        policy: account.dmPolicy,
        allowFrom: account.allowFrom,
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint(CHANNEL_ID),
        normalizeEntry: (raw) =>
          raw
            .trim()
            .replace(/^yunjia:/i, "")
            .replace(/^user:/i, "")
            .toLowerCase(),
      };
    },
    collectWarnings: ({ account }) => {
      const warnings: string[] = [];
      if (account.dmPolicy === "open") {
        warnings.push(
          '- Yunjia DMs: dmPolicy="open" allows any sender to trigger the bot. Consider "pairing" or "allowlist".',
        );
      }
      if (account.dmPolicy === "allowlist" && account.allowFrom.length === 0) {
        warnings.push(
          '- Yunjia DMs: dmPolicy="allowlist" with empty allowFrom blocks all senders.',
        );
      }
      if (!account.idmBaseUrl) {
        warnings.push("- Yunjia: idmBaseUrl is missing.");
      }
      if (!account.clientId) {
        warnings.push("- Yunjia: clientId is missing.");
      }
      if (!account.clientSecret) {
        warnings.push("- Yunjia: clientSecret is missing.");
      }
      return warnings;
    },
  },

  messaging: {
    normalizeTarget: normalizeYunjiaMessagingTarget,
    targetResolver: {
      looksLikeId: (target) => looksLikeYunjiaTarget(target),
      hint: "<user:uid|group:channelId|direct:channelId>",
    },
  },

  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },

  outbound: {
    deliveryMode: "gateway",
    textChunkLimit: 3000,
    resolveTarget: ({ to, cfg, accountId }) => {
      const target =
        to?.trim() || resolveYunjiaAccount((cfg ?? {}) as OpenClawConfig, accountId).defaultTo;
      if (!target) {
        return {
          ok: false,
          error: missingTargetError("Yunjia", "<user:uid|group:channelId|direct:channelId>"),
        };
      }
      return {
        ok: true,
        to: target,
      };
    },
    sendText: async ({ cfg, to, text, accountId }) => {
      const resolvedAccountId = resolveRuntimeAccountId(accountId);
      const account = resolveYunjiaAccount(cfg, resolvedAccountId);
      const sdk = requireRunningClient(resolvedAccountId);
      const target = to?.trim() || account.defaultTo;
      if (!target) {
        throw missingTargetError("Yunjia", "<user:uid|group:channelId|direct:channelId>");
      }
      const sent = await sendTextToYunjia({
        sdk,
        target,
        text,
        enterpriseId: account.tenantId,
      });
      return {
        channel: CHANNEL_ID,
        messageId: `yunjia-${Date.now()}`,
        chatId: sent.channelId,
      };
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      reconnectAttempts: 0,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    },
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: isYunjiaAccountConfigured(account),
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      reconnectAttempts: runtime?.reconnectAttempts,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastDisconnect: runtime?.lastDisconnect ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
      dmPolicy: account.dmPolicy,
      allowFrom: account.allowFrom,
      baseUrl: account.idmBaseUrl || undefined,
      mode: account.socketIoMode,
      credentialSource: account.accessToken ? "token" : account.username ? "password" : "none",
    }),
    resolveAccountState: ({ configured }) => (configured ? "configured" : "not configured"),
  },

  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const accountId = resolveRuntimeAccountId(ctx.accountId);

      const setStatus = (patch: Partial<ChannelAccountSnapshot>) =>
        ctx.setStatus({ accountId, ...patch });

      if (!account.enabled) {
        setStatus({ running: false, connected: false, lastError: "disabled" });
        return;
      }

      if (!isYunjiaAccountConfigured(account)) {
        setStatus({ running: false, connected: false, lastError: "not configured" });
        return;
      }

      await closeActiveClient(accountId);

      const sdk = await createYunjiaSdkClient({
        account,
        logger: toSdkLogger(accountId, ctx.log),
      });

      activeClients.set(accountId, sdk);

      sdk.on("ready", (session) => {
        const message = `Yunjia ready (enterprise=${session.enterpriseId ?? "unknown"})`;
        ctx.log?.info?.(`[${accountId}] ${message}`);
      });
      sdk.on("connected", () => {
        setStatus({ connected: true, lastConnectedAt: Date.now(), lastError: null });
      });
      sdk.on("disconnected", (reason) => {
        setStatus({
          connected: false,
          lastDisconnect: reason,
        });
      });
      sdk.on("reconnecting", (attempt) => {
        setStatus({ reconnectAttempts: attempt, connected: false });
      });
      sdk.on("error", (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setStatus({ lastError: errorMessage });
        ctx.log?.error?.(`[${accountId}] ${errorMessage}`);
      });
      sdk.on("message", (message) => {
        const channelId = resolveInboundChannelId(message);
        if (channelId) {
          try {
            sdk.markChannelRead({ channelId, enterpriseId: account.tenantId });
          } catch (error) {
            ctx.log?.warn?.(
              `[${accountId}] failed to mark channel as read (${channelId}): ${String(error)}`,
            );
          }
        }
        if (isSelfInboundMessage(sdk, message)) {
          ctx.log?.debug?.(`[${accountId}] skipping self-sent message`);
          return;
        }
        void processInboundMessage({
          message,
          cfg: ctx.cfg,
          account,
          accountId,
          setStatus,
          log: ctx.log,
        }).catch((error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setStatus({ lastError: errorMessage });
          ctx.log?.error?.(`[${accountId}] failed to process inbound message: ${errorMessage}`);
        });
      });

      try {
        await sdk.initialize();
        setStatus({
          running: true,
          connected: sdk.isConnected(),
          lastStartAt: Date.now(),
          lastError: null,
        });
      } catch (error) {
        await closeActiveClient(accountId);
        throw error;
      }

      await new Promise<void>((resolve) => {
        if (ctx.abortSignal.aborted) {
          resolve();
          return;
        }
        ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });

      await closeActiveClient(accountId);
      setStatus({ running: false, connected: false, lastStopAt: Date.now() });
    },

    stopAccount: async (ctx) => {
      const accountId = resolveRuntimeAccountId(ctx.accountId);
      await closeActiveClient(accountId);
      ctx.setStatus({
        accountId,
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
    },
  },

  agentPrompt: {
    messageToolHints: () => [
      "",
      "### Yunjia Target Hints",
      "Use one of these target forms when sending manually:",
      "- `user:<uid>`: send to a user (auto-create direct channel)",
      "- `group:<channelId>` or `channel:<channelId>`: send to a group channel",
      "- `direct:<channelId>`: send to a known direct channel",
      "",
      "Without prefix, OpenClaw treats the target as a direct channel ID.",
    ],
  },
};
