# openclaw-yunjia

Yunjia chat channel plugin for OpenClaw.

## Install

From npm:

```bash
openclaw plugins install openclaw-yunjia
```

From local directory (dev):

```bash
openclaw plugins install ./openclaw-yunjia-plugin
```

## Minimal config

```json
{
  "channels": {
    "yunjia": {
      "enabled": true,
      "idmBaseUrl": "https://passport.example.com",
      "clientId": "your_client_id",
      "clientSecret": "your_client_secret",
      "username": "bot_user",
      "password": "bot_password",
      "tenantId": "default"
    }
  }
}
```

## SDK resolution

The plugin resolves Yunjia SDK in this order:

1. `channels.yunjia.sdkPath` (loads `<sdkPath>/dist/index.js`)
2. `channels.yunjia.sdkModule` (default: `yunjia-chat-sdk`)

For public users, publish `yunjia-chat-sdk` to npm first so default install works without local paths.

Required config: `idmBaseUrl`, `clientId`, `clientSecret`, and either
`accessToken` or (`username` + `password`).

## Gateway 可视化配置项说明

这些字段对应 `channels.yunjia`（以及 `channels.yunjia.accounts.<accountId>`）。

鉴权最小要求：

- 必填：`idmBaseUrl`、`clientId`、`clientSecret`
- 认证二选一：
  - `accessToken`（可选 `refreshToken`）
  - `username` + `password`

字段说明：

| 配置项 | 可选值 / 默认值 | 影响 |
| --- | --- | --- |
| `enabled` | `true` / `false`（默认 `true`） | 是否启用该账号。`false` 时网关不会启动该账号连接，无法收发消息。 |
| `idmBaseUrl` | URL 字符串（必填） | 云加鉴权服务地址。缺失时账号会被判定为未配置，网关不会连接。 |
| `clientId` | 字符串（必填） | SDK 客户端 ID。缺失时账号未配置。 |
| `clientSecret` | 字符串（必填，敏感） | SDK 客户端密钥。缺失时账号未配置。 |
| `username` | 字符串 | 用户名登录模式使用。仅在未提供 `accessToken` 时生效。 |
| `password` | 字符串（敏感） | 用户名登录模式使用。需和 `username` 一起提供。 |
| `tenantId` | 字符串（可选） | 作为 `enterpriseId` 传给 SDK 的发消息与已读确认接口，用于租户隔离场景。 |
| `name` | 任意字符串 | 账号显示名，仅影响状态展示与区分账号。 |
| `accessToken` | 字符串（敏感） | Token 登录模式。提供后会优先使用 token 模式，不再使用 `username/password`。 |
| `refreshToken` | 字符串（敏感） | Token 登录模式的刷新令牌；仅在 `accessToken` 存在时传给 SDK。 |
| `socketIoMode` | `v2` / `v4` / `auto`（默认 `v2`） | SDK Socket.IO 兼容模式。服务端版本不匹配时可切换。 |
| `sdkPath` | 本地路径（可选） | 指定本地 SDK 目录/文件。设置后优先于 `sdkModule`。适合本地联调。 |
| `sdkModule` | npm 包名（默认 `yunjia-chat-sdk`） | 当未设置 `sdkPath` 时，按模块名加载 SDK。 |
| `dmPolicy` | `pairing` / `allowlist` / `open` / `disabled`（默认 `pairing`） | 私聊触发策略：`pairing` 未授权用户走配对；`allowlist` 仅白名单用户可触发；`open` 任意用户可触发；`disabled` 私聊全部禁用。 |
| `allowFrom` | 字符串数组，或逗号分隔字符串（默认空） | 私聊允许列表。对 `allowlist`/`pairing` 生效；为空时 `allowlist` 会阻止所有未匹配用户。可视化页面建议使用字符串数组。 |
| `defaultTo` | 目标字符串（如 `user:1001`） | 主动发送消息时若未提供 `to`，会使用该默认目标。 |
| `accounts` | 对象（键为账号 ID） | 多账号配置入口。每个账号可覆盖上述字段。 |

### `dmPolicy` 具体行为

- `pairing`：已在 allowlist 或 pairing store 里的用户可触发；未授权用户会进入配对流程。
- `allowlist`：只有 allowlist 中用户能触发；不读取 pairing store 作为补充。
- `open`：所有私聊用户都可触发（生产环境风险较高）。
- `disabled`：所有私聊触发都被拒绝。

### 多账号覆盖规则

- 顶层 `channels.yunjia.<field>` 可作为默认值。
- `channels.yunjia.accounts.<accountId>.<field>` 会覆盖同名顶层字段。
- 未显式配置 `accounts` 时，默认使用 `default` 账号。

## Message behavior

- Inbound messages are marked as read immediately.
- Self-sent messages are ignored and will not trigger bot replies.
- Outbound target formats:
  - `user:<uid>`
  - `group:<channelId>` / `channel:<channelId>`
  - `direct:<channelId>`

## Development

```bash
npm install
npm run test
npm run typecheck
npm run pack:check
```

## Publish

```bash
npm login
npm publish --access public
```

After publish, users install with:

```bash
openclaw plugins install openclaw-yunjia
```
