export type YunjiaDmPolicy = "pairing" | "allowlist" | "open" | "disabled";

export type YunjiaSocketIoMode = "v2" | "v4" | "auto";

export interface YunjiaAccountRaw {
  enabled?: boolean;
  name?: string;
  idmBaseUrl?: string;
  username?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  socketIoMode?: YunjiaSocketIoMode;
  sdkPath?: string;
  sdkModule?: string;
  dmPolicy?: YunjiaDmPolicy;
  allowFrom?: string[] | string;
  defaultTo?: string;
}

export interface YunjiaChannelConfig extends YunjiaAccountRaw {
  accounts?: Record<string, YunjiaAccountRaw>;
}

export interface ResolvedYunjiaAccount {
  accountId: string;
  enabled: boolean;
  name?: string;
  idmBaseUrl: string;
  username?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  socketIoMode: YunjiaSocketIoMode;
  sdkPath?: string;
  sdkModule: string;
  dmPolicy: YunjiaDmPolicy;
  allowFrom: string[];
  defaultTo?: string;
}

export interface YunjiaInboundMessage {
  headers?: {
    enterprise?: string;
    tracer?: string;
  };
  action?: {
    method?: string;
    path?: string;
    status?: string | number;
  };
  body?: {
    id?: string;
    channel?: string;
    message?: string;
    creationDate?: string | number;
    from?: {
      user?: string;
      id?: string;
      name?: string;
      enterprise?: string;
    };
    content?: {
      text?: string;
      message?: string;
      channelType?: string;
    };
  };
}

export interface YunjiaChatSession {
  uid?: string;
  enterpriseId?: string;
  chatBaseUrl?: string;
  chatClientId?: string;
}

export interface YunjiaChatSdkLogger {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface YunjiaChatSdkOptions {
  idmBaseUrl: string;
  username?: string;
  password?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  socketIoMode?: YunjiaSocketIoMode;
  autoConnect?: boolean;
  preloadChannels?: boolean;
  tokens?: {
    accessToken: string;
    refreshToken?: string;
  };
  logger?: YunjiaChatSdkLogger;
}

export interface YunjiaChatSdkInstance {
  on(event: "ready", listener: (session: YunjiaChatSession) => void): this;
  on(event: "connected", listener: () => void): this;
  on(event: "disconnected", listener: (reason: string) => void): this;
  on(event: "reconnecting", listener: (attempt: number) => void): this;
  on(event: "message", listener: (message: YunjiaInboundMessage) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  initialize(): Promise<YunjiaChatSession>;
  isConnected(): boolean;
  close(): void;
  getSession(): YunjiaChatSession;
  createDirectChannel(mateUserId: string): Promise<{ id: string; [key: string]: unknown }>;
  sendTextDirect(options: { channelId: string; text: string; enterpriseId?: string }): void;
  sendTextGroup(options: {
    channelId: string;
    text: string;
    mentionUserId?: string;
    enterpriseId?: string;
  }): void;
  markChannelRead(options: { channelId: string; enterpriseId?: string }): void;
}

export type YunjiaChatSdkConstructor = new (options: YunjiaChatSdkOptions) => YunjiaChatSdkInstance;
