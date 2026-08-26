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
  accessKey: string;
  enableCookieAuth: boolean;
}

export const Config: z<Config> = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.natural().max(65535).default(3081),
  applyRandomUuidPatch: z.boolean().default(true),
  applyLoopbackCheckPatch: z.boolean().default(true),
  accessKey: z.string().default(""),
  enableCookieAuth: z.boolean().default(false),
});

export function apply(ctx: Context, config: Config): void {
  if (config.enableCookieAuth) {
    if (!config.accessKey) {
      console.error(
        `[${PLUGIN_NAME}] error: cookie auth is enabled, but the access key is missing. please configure accessKey.`,
      );
      return;
    }
  } else {
    console.warn(
      `[${PLUGIN_NAME}] warning: no auth is enabled. your proxy is publicly accessible without authentication.`,
    );
  }

  if (config.applyRandomUuidPatch) {
    ctx.effect(
      () => ctx.webServer.tapIndex(injectRandomUuidPolyfill),
      `[${PLUGIN_NAME}] randomUUID patch`,
    );
  }

  ctx.effect(async () => {
    const target = `http://127.0.0.1:${String(ctx.webServer.port)}`;
    const proxy = createProxyServer(ctx, config, target);
    try {
      const { port } = await proxy.listen(config.port, config.host);
      console.log(
        `[${PLUGIN_NAME}] proxy server is listening on ${config.host}:${String(port)} -> ${target}`,
      );
    } catch (err) {
      console.error(
        `[${PLUGIN_NAME}] error: failed to listen on ${config.host}:${String(config.port)}:`,
        err instanceof Error ? err.message : err,
      );
      void ctx.fiber.dispose();
      throw err;
    }
    return () => proxy.close();
  }, `[${PLUGIN_NAME}] proxy server`);
}
