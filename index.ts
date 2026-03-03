import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { yunjiaPlugin } from "./src/channel.js";
import { setYunjiaRuntime } from "./src/runtime.js";

const plugin = {
  id: "yunjia",
  name: "Yunjia Chat",
  description: "Yunjia chat channel plugin for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setYunjiaRuntime(api.runtime);
    api.registerChannel({ plugin: yunjiaPlugin });
  },
};

export default plugin;
