import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setYunjiaRuntime(nextRuntime: PluginRuntime): void {
  runtime = nextRuntime;
}

export function getYunjiaRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Yunjia runtime not initialized - plugin not registered");
  }
  return runtime;
}
