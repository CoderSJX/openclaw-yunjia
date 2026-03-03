import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ResolvedYunjiaAccount,
  YunjiaChatSdkConstructor,
  YunjiaChatSdkInstance,
  YunjiaChatSdkLogger,
  YunjiaChatSdkOptions,
} from "./types.js";

const sdkConstructorCache = new Map<string, Promise<YunjiaChatSdkConstructor>>();

function expandHomeDir(inputPath: string): string {
  if (!inputPath.startsWith("~/")) {
    return inputPath;
  }
  const home = process.env.HOME;
  if (!home) {
    return inputPath;
  }
  return path.join(home, inputPath.slice(2));
}

function resolveSdkPathToImportTarget(rawPath: string): string {
  const expanded = expandHomeDir(rawPath.trim());
  const resolved = path.isAbsolute(expanded) ? expanded : path.resolve(process.cwd(), expanded);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Yunjia SDK path does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return pathToFileURL(resolved).href;
  }

  const candidates = [
    path.join(resolved, "dist", "index.js"),
    path.join(resolved, "dist", "index.mjs"),
    path.join(resolved, "index.js"),
    path.join(resolved, "index.mjs"),
  ];

  const entry = candidates.find((candidate) => fs.existsSync(candidate));
  if (!entry) {
    throw new Error(
      `Unable to find Yunjia SDK entry under ${resolved}. Expected dist/index.js or index.js.`,
    );
  }

  return pathToFileURL(entry).href;
}

function resolveSdkImportTarget(account: ResolvedYunjiaAccount): string {
  const configuredPath = account.sdkPath?.trim();
  if (configuredPath) {
    return resolveSdkPathToImportTarget(configuredPath);
  }
  return account.sdkModule;
}

function resolveSdkConstructorFromModule(moduleValue: unknown): YunjiaChatSdkConstructor {
  if (!moduleValue || typeof moduleValue !== "object") {
    throw new Error("Yunjia SDK module is invalid: expected an object export");
  }

  const moduleRecord = moduleValue as Record<string, unknown>;
  const namedCtor = moduleRecord.YunjiaChatSDK;
  if (typeof namedCtor === "function") {
    return namedCtor as YunjiaChatSdkConstructor;
  }

  const defaultExport = moduleRecord.default;
  if (typeof defaultExport === "function") {
    return defaultExport as YunjiaChatSdkConstructor;
  }

  if (defaultExport && typeof defaultExport === "object") {
    const nestedCtor = (defaultExport as Record<string, unknown>).YunjiaChatSDK;
    if (typeof nestedCtor === "function") {
      return nestedCtor as YunjiaChatSdkConstructor;
    }
  }

  throw new Error("Yunjia SDK constructor not found. Export YunjiaChatSDK from the SDK module.");
}

export async function loadYunjiaSdkConstructor(
  account: ResolvedYunjiaAccount,
): Promise<YunjiaChatSdkConstructor> {
  const target = resolveSdkImportTarget(account);
  const cached = sdkConstructorCache.get(target);
  if (cached) {
    return await cached;
  }

  const loadPromise = (async () => {
    const moduleValue = await import(target);
    return resolveSdkConstructorFromModule(moduleValue);
  })();

  sdkConstructorCache.set(target, loadPromise);

  try {
    return await loadPromise;
  } catch (error) {
    sdkConstructorCache.delete(target);
    throw error;
  }
}

export async function createYunjiaSdkClient(params: {
  account: ResolvedYunjiaAccount;
  logger?: YunjiaChatSdkLogger;
}): Promise<YunjiaChatSdkInstance> {
  const { account, logger } = params;
  const SdkConstructor = await loadYunjiaSdkConstructor(account);

  const options: YunjiaChatSdkOptions = {
    idmBaseUrl: account.idmBaseUrl,
    tenantId: account.tenantId,
    clientId: account.clientId,
    clientSecret: account.clientSecret,
    socketIoMode: account.socketIoMode,
    autoConnect: true,
    preloadChannels: true,
    logger,
  };

  if (account.accessToken) {
    options.tokens = {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
    };
  } else if (account.username && account.password) {
    options.username = account.username;
    options.password = account.password;
  }

  return new SdkConstructor(options);
}
