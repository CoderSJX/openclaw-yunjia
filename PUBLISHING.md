# Publishing Guide

This project is ready to publish, but do not push to GitHub until you choose your final package name.

## 1. Decide package names

- SDK package: `yunjia-chat-sdk` (or your own scoped name)
- Plugin package: `openclaw-yunjia` (or your own scoped name)

If you change names, update:

- `package.json` `name`
- `package.json` `openclaw.install.npmSpec`
- `src/accounts.ts` default `sdkModule` value (if SDK package name changed)

## 2. Publish SDK first

Users installing plugin from npm should not depend on local `sdkPath`.
So publish SDK first:

```bash
cd /path/to/yunjia-chat-sdk
npm login
npm publish --access public
```

Verify:

```bash
npm view yunjia-chat-sdk version --userconfig "$(mktemp)"
```

## 3. Publish plugin

```bash
cd /path/to/openclaw-yunjia-plugin
npm login
npm pack --dry-run
npm publish --access public
```

Verify:

```bash
npm view openclaw-yunjia version --userconfig "$(mktemp)"
```

## 4. Install test with OpenClaw

```bash
openclaw plugins install openclaw-yunjia
openclaw plugins list
```

Then configure `channels.yunjia` in your OpenClaw config and restart gateway.

## 5. Optional: add to channel catalog UX

`openclaw plugins install <npm-spec>` already works without catalog.
If you also want `openclaw channels add` to show Yunjia in selectable catalog, provide a catalog JSON entry with `openclaw.channel` metadata.
