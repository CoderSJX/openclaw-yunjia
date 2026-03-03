import { describe, expect, it } from "vitest";
import { yunjiaChannelConfigSchema } from "./config-schema.js";

type JsonSchemaObject = {
  properties?: Record<string, unknown>;
  additionalProperties?: unknown;
};

describe("yunjia config schema", () => {
  it("exposes required auth fields for gateway config UI", () => {
    const root = yunjiaChannelConfigSchema.schema as JsonSchemaObject;
    const rootProps = root.properties ?? {};

    expect(rootProps.idmBaseUrl).toBeTruthy();
    expect(rootProps.clientId).toBeTruthy();
    expect(rootProps.clientSecret).toBeTruthy();
    expect(rootProps.accounts).toBeTruthy();

    const accountsNode = rootProps.accounts as JsonSchemaObject;
    const accountSchema = accountsNode.additionalProperties as JsonSchemaObject;
    const accountProps = accountSchema.properties ?? {};

    expect(accountProps.clientId).toBeTruthy();
    expect(accountProps.clientSecret).toBeTruthy();
    expect(accountProps.accessToken).toBeTruthy();
  });

  it("marks credential fields as sensitive", () => {
    const hints = (yunjiaChannelConfigSchema.uiHints ?? {}) as Record<
      string,
      { sensitive?: boolean }
    >;

    expect(hints.password?.sensitive).toBe(true);
    expect(hints.clientSecret?.sensitive).toBe(true);
    expect(hints.accessToken?.sensitive).toBe(true);
    expect(hints.refreshToken?.sensitive).toBe(true);
    expect(hints["accounts.*.password"]?.sensitive).toBe(true);
    expect(hints["accounts.*.clientSecret"]?.sensitive).toBe(true);
    expect(hints["accounts.*.accessToken"]?.sensitive).toBe(true);
    expect(hints["accounts.*.refreshToken"]?.sensitive).toBe(true);
  });
});
