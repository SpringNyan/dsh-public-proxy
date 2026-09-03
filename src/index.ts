import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import type {} from "@deepseek-ai/dsh-host-webserver";
import z from "@deepseek-ai/schemastery";
import { LAUNCH_TOKEN_QUERY, PLUGIN_NAME } from "./constants.js";
import { createProxyServer } from "./proxy.js";
import { injectRandomUuidPolyfill } from "./uuid.js";

export const name = PLUGIN_NAME;

export const inject = ["connection", "webServer"];

export interface Config {
  host: string;
  port: number;
  applyRandomUuidPatch: boolean;
  applyIsLoopbackPatch: boolean;
  accessKey: string;
  enableCookieAuth: boolean;
  bypassLaunchToken: boolean;
}

export const Config: z<Config> = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.natural().max(65535).default(3081),
  applyRandomUuidPatch: z.boolean().default(true),
  applyIsLoopbackPatch: z.boolean().default(true),
  accessKey: z.string().default(""),
  enableCookieAuth: z.boolean().default(false),
  bypassLaunchToken: z.boolean().default(false),
});

export function apply(ctx: Context, config: Config): void {
  if (config.enableCookieAuth) {
    if (!config.accessKey) {
      console.error(
        `[${PLUGIN_NAME}] error: cookie auth is enabled, but the access key is missing. please configure accessKey.`,
      );
      return;
    }
  } else if (config.bypassLaunchToken) {
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
    let cachedLaunchToken: string | null | undefined;
    const launchTokenProvider = (): string | null => {
      if (cachedLaunchToken !== undefined) {
        return cachedLaunchToken;
      }
      cachedLaunchToken = null;
      try {
        const tokenUrl = ctx.connection.authenticatedUrl("http://x");
        cachedLaunchToken = new URL(tokenUrl).searchParams.get(
          LAUNCH_TOKEN_QUERY,
        );
        if (cachedLaunchToken === null) {
          ctx.logger.error(
            `[${PLUGIN_NAME}] error: bypassLaunchToken failed to resolve the launch token: the token query is missing from`,
            tokenUrl,
          );
        }
      } catch (err) {
        ctx.logger.error(
          `[${PLUGIN_NAME}] error: bypassLaunchToken failed to resolve the launch token from the connection service:`,
          err,
        );
      }
      return cachedLaunchToken;
    };

    const target = `http://127.0.0.1:${String(ctx.webServer.port)}`;
    const proxy = createProxyServer(ctx, config, target, launchTokenProvider);
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
