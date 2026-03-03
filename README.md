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
