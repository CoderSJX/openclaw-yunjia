import { DEFAULT_ACCOUNT_ID, type OpenClawConfig } from "openclaw/plugin-sdk";
import { describe, expect, it } from "vitest";
import {
  isYunjiaAccountConfigured,
  listYunjiaAccountIds,
  resolveYunjiaAccount,
} from "./accounts.js";

describe("yunjia accounts", () => {
  it("returns empty account list when channel config is missing", () => {
    const cfg = { channels: {} } as OpenClawConfig;
    expect(listYunjiaAccountIds(cfg)).toEqual([]);
  });

  it("lists default and named accounts", () => {
    const cfg = {
      channels: {
        yunjia: {
          idmBaseUrl: "https://idm.example.com",
          accounts: {
            robot: {
              idmBaseUrl: "https://idm2.example.com",
            },
          },
        },
      },
    } as OpenClawConfig;

    expect(new Set(listYunjiaAccountIds(cfg))).toEqual(new Set([DEFAULT_ACCOUNT_ID, "robot"]));
  });

  it("resolves account override on top of channel defaults", () => {
    const cfg = {
      channels: {
        yunjia: {
          idmBaseUrl: "https://idm.example.com",
          tenantId: "default",
          accounts: {
            robot: {
              tenantId: "tenant-a",
              accessToken: "token-a",
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveYunjiaAccount(cfg, "robot");
    expect(account.accountId).toBe("robot");
    expect(account.idmBaseUrl).toBe("https://idm.example.com");
    expect(account.tenantId).toBe("tenant-a");
    expect(account.accessToken).toBe("token-a");
    expect(isYunjiaAccountConfigured(account)).toBe(true);
  });

  it("is not configured when idmBaseUrl is missing", () => {
    const cfg = {
      channels: {
        yunjia: {
          username: "robot",
          password: "secret",
        },
      },
    } as OpenClawConfig;

    const account = resolveYunjiaAccount(cfg, DEFAULT_ACCOUNT_ID);
    expect(isYunjiaAccountConfigured(account)).toBe(false);
  });
});
