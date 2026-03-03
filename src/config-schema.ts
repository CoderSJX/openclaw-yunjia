import { buildChannelConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

const YunjiaDmPolicySchema = z.enum(["pairing", "allowlist", "open", "disabled"]);
const YunjiaSocketIoModeSchema = z.enum(["v2", "v4", "auto"]);

const allowFromSchema = z.union([z.array(z.string()), z.string()]);

const YunjiaAccountSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  idmBaseUrl: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  tenantId: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  socketIoMode: YunjiaSocketIoModeSchema.optional(),
  sdkPath: z.string().optional(),
  sdkModule: z.string().optional(),
  dmPolicy: YunjiaDmPolicySchema.optional(),
  allowFrom: allowFromSchema.optional(),
  defaultTo: z.string().optional(),
});

const YunjiaConfigSchema = YunjiaAccountSchema.extend({
  accounts: z.record(z.string(), YunjiaAccountSchema).optional(),
});

const topLevelHints = {
  enabled: { label: "Enable Yunjia" },
  name: { label: "Account Name" },
  idmBaseUrl: {
    label: "IDM Base URL",
    help: "Required. Example: https://passport.example.com",
    placeholder: "https://passport.example.com",
  },
  username: { label: "Username" },
  password: { label: "Password", sensitive: true },
  tenantId: { label: "Tenant ID", placeholder: "default" },
  clientId: { label: "Client ID", help: "Required." },
  clientSecret: { label: "Client Secret", sensitive: true, help: "Required." },
  accessToken: {
    label: "Access Token",
    sensitive: true,
    help: "Optional alternative to username/password.",
  },
  refreshToken: { label: "Refresh Token", sensitive: true, advanced: true },
  socketIoMode: { label: "Socket.IO Mode" },
  sdkPath: { label: "SDK Path", advanced: true },
  sdkModule: { label: "SDK Module", advanced: true, placeholder: "yunjia-chat-sdk" },
  dmPolicy: { label: "DM Policy" },
  allowFrom: {
    label: "Allow From",
    help: 'User allowlist for dmPolicy="allowlist" (array or comma-separated string).',
  },
  defaultTo: {
    label: "Default To",
    help: "Default send target if `to` is omitted.",
    placeholder: "user:10001",
  },
  accounts: {
    label: "Accounts",
    help: "Optional per-account overrides keyed by account id.",
  },
} as const;

const accountHintKeys = [
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
] as const;

const accountHints = Object.fromEntries(
  accountHintKeys.map((key) => [`accounts.*.${key}`, topLevelHints[key]]),
);

export const yunjiaChannelConfigSchema = {
  ...buildChannelConfigSchema(YunjiaConfigSchema),
  uiHints: {
    ...topLevelHints,
    ...accountHints,
  },
};

