import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import z from "@deepseek-ai/schemastery";
import { PLUGIN_NAME } from "./constants.js";
import { createProxyServer } from "./proxy.js";
import { injectRandomUuidPolyfill } from "./uuid.js";

export const name = PLUGIN_NAME;

export const inject = ["webServer"];

export interface Config {
  host: string;
  port: number;
  applyRandomUuidPatch: boolean;
  applyLoopbackCheckPatch: boolean;
}

export const Config: z<Config> = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.natural().max(65535).default(3081),
  applyRandomUuidPatch: z.boolean().default(true),
  applyLoopbackCheckPatch: z.boolean().default(true),
});

export function apply(ctx: Context, config: Config): void {
  if (config.applyRandomUuidPatch) {
    ctx.effect(
      () => ctx.webServer.tapIndex(injectRandomUuidPolyfill),
      `[${PLUGIN_NAME}] randomUUID polyfill index tap`,
    );
  }

  ctx.effect(async () => {
    const target = `http://127.0.0.1:${String(ctx.webServer.port)}`;
    const proxy = createProxyServer(ctx, config, target);
    await proxy.listen(config.port, config.host);
    console.log(
      `[${PLUGIN_NAME}] public proxy ${config.host}:${String(config.port)} -> ${target}`,
    );
    return () => proxy.close();
  }, `[${PLUGIN_NAME}] proxy server`);
}
