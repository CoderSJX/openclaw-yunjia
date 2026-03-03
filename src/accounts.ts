import { DEFAULT_ACCOUNT_ID, type OpenClawConfig } from "openclaw/plugin-sdk";
import type {
  ResolvedYunjiaAccount,
  YunjiaAccountRaw,
  YunjiaChannelConfig,
  YunjiaDmPolicy,
  YunjiaSocketIoMode,
} from "./types.js";

const CHANNEL_ID = "yunjia";
const DEFAULT_SDK_MODULE = "yunjia-chat-sdk";

function readChannelConfig(cfg: OpenClawConfig): YunjiaChannelConfig | undefined {
  return (cfg.channels?.[CHANNEL_ID] as YunjiaChannelConfig | undefined) ?? undefined;
}

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseAllowFrom(value: string[] | string | undefined): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveSocketMode(value: string | undefined): YunjiaSocketIoMode {
  if (value === "v2" || value === "v4" || value === "auto") {
    return value;
  }
  return "v2";
}

function resolveDmPolicy(value: string | undefined): YunjiaDmPolicy {
  if (value === "pairing" || value === "allowlist" || value === "open" || value === "disabled") {
    return value;
  }
  return "pairing";
}

function hasDefaultAccountConfig(channelCfg: YunjiaChannelConfig): boolean {
  const keys: Array<keyof YunjiaChannelConfig> = [
    "enabled",
    "name",
    "idmBaseUrl",
    "username",
    "password",
    "tenantId",
    "clientId",
    "clientSecret",
    "accessToken",
    "refreshToken",
    "socketIoMode",
    "sdkPath",
    "sdkModule",
    "dmPolicy",
    "allowFrom",
    "defaultTo",
  ];
  return keys.some((key) => {
    const raw = channelCfg[key];
    if (raw === undefined || raw === null) {
      return false;
    }
    if (Array.isArray(raw)) {
      return raw.length > 0;
    }
    if (typeof raw === "string") {
      return raw.trim().length > 0;
    }
    return true;
  });
}

function mergeAccountConfig(
  channelCfg: YunjiaChannelConfig,
  accountCfg: YunjiaAccountRaw | undefined,
): YunjiaAccountRaw {
  return {
    ...channelCfg,
    ...(accountCfg ?? {}),
  };
}

export function listYunjiaAccountIds(cfg: OpenClawConfig): string[] {
  const channelCfg = readChannelConfig(cfg);
  if (!channelCfg) {
    return [];
  }

  const ids = new Set<string>(Object.keys(channelCfg.accounts ?? {}));
  if (hasDefaultAccountConfig(channelCfg) || ids.size === 0) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  return Array.from(ids);
}

export function resolveYunjiaAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedYunjiaAccount {
  const channelCfg = readChannelConfig(cfg) ?? {};
  const id = normalizeString(accountId ?? undefined) ?? DEFAULT_ACCOUNT_ID;
  const accountCfg = channelCfg.accounts?.[id];
  const merged = mergeAccountConfig(channelCfg, accountCfg);

  const envAllowFrom = normalizeString(process.env.YUNJIA_ALLOW_FROM);
  const mergedAllowFrom =
    merged.allowFrom ?? (envAllowFrom ? envAllowFrom.split(",").map((entry) => entry.trim()) : []);

  return {
    accountId: id,
    enabled: merged.enabled ?? true,
    name: normalizeString(merged.name),
    idmBaseUrl:
      normalizeString(merged.idmBaseUrl) ?? normalizeString(process.env.YUNJIA_IDM_BASE_URL) ?? "",
    username: normalizeString(merged.username) ?? normalizeString(process.env.YUNJIA_USERNAME),
    password: normalizeString(merged.password) ?? normalizeString(process.env.YUNJIA_PASSWORD),
    tenantId: normalizeString(merged.tenantId) ?? normalizeString(process.env.YUNJIA_TENANT_ID),
    clientId: normalizeString(merged.clientId) ?? normalizeString(process.env.YUNJIA_CLIENT_ID),
    clientSecret:
      normalizeString(merged.clientSecret) ?? normalizeString(process.env.YUNJIA_CLIENT_SECRET),
    accessToken:
      normalizeString(merged.accessToken) ?? normalizeString(process.env.YUNJIA_ACCESS_TOKEN),
    refreshToken:
      normalizeString(merged.refreshToken) ?? normalizeString(process.env.YUNJIA_REFRESH_TOKEN),
    socketIoMode: resolveSocketMode(
      normalizeString(merged.socketIoMode) ?? normalizeString(process.env.YUNJIA_SOCKET_IO_MODE),
    ),
    sdkPath: normalizeString(merged.sdkPath) ?? normalizeString(process.env.YUNJIA_SDK_PATH),
    sdkModule:
      normalizeString(merged.sdkModule) ??
      normalizeString(process.env.YUNJIA_SDK_MODULE) ??
      DEFAULT_SDK_MODULE,
    dmPolicy: resolveDmPolicy(
      normalizeString(merged.dmPolicy) ?? normalizeString(process.env.YUNJIA_DM_POLICY),
    ),
    allowFrom: parseAllowFrom(mergedAllowFrom),
    defaultTo: normalizeString(merged.defaultTo) ?? normalizeString(process.env.YUNJIA_DEFAULT_TO),
  };
}

export function isYunjiaAccountConfigured(account: ResolvedYunjiaAccount): boolean {
  if (!account.idmBaseUrl) {
    return false;
  }
  if (account.accessToken) {
    return true;
  }
  return Boolean(account.username && account.password);
}
