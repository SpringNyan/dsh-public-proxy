import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import type {} from "@deepseek-ai/dsh-host-webserver";
import z from "@deepseek-ai/schemastery";
import { createAccessKeyVerifier } from "./auth.js";
import { LAUNCH_TOKEN_QUERY, PLUGIN_NAME } from "./constants.js";
import { createDshProxyServer } from "./proxy.js";

export const name = PLUGIN_NAME;

export const inject = ["connection", "webServer"];

export interface Config {
  host: string;
  port: number;
  bypassDshWebAuth: boolean;
  accessKey: string;
  cookieAuth: boolean;
  headerAuth: boolean;
}

export const Config: z<Config> = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.natural().max(65535).default(3081),
  bypassDshWebAuth: z.boolean().default(false),
  accessKey: z.string().default(""),
  cookieAuth: z.boolean().default(false),
  headerAuth: z.boolean().default(false),
});

function resolveLaunchToken(ctx: Context, target: string): string {
  let token: string | null;
  try {
    token = new URL(ctx.connection.authenticatedUrl(target)).searchParams.get(
      LAUNCH_TOKEN_QUERY,
    );
  } catch {
    // URL parsing errors can contain the authenticated URL. Do not log the cause.
    throw new Error(
      `[${PLUGIN_NAME}] failed to enable bypassDshWebAuth: failed to obtain the DSH launch token`,
    );
  }
  if (!token) {
    throw new Error(
      `[${PLUGIN_NAME}] failed to enable bypassDshWebAuth: DSH returned no launch token`,
    );
  }
  return token;
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const authEnabled = config.cookieAuth || config.headerAuth;
  if (authEnabled && !config.accessKey) {
    throw new Error(
      `[${PLUGIN_NAME}] cookieAuth/headerAuth requires accessKey to be non-empty`,
    );
  }
  if (config.accessKey && !authEnabled) {
    throw new Error(
      `[${PLUGIN_NAME}] accessKey requires enabling cookieAuth or headerAuth`,
    );
  }

  const target = new URL(ctx.webServer.getOrigin());
  if (target.protocol !== "http:") {
    throw new Error(
      `[${PLUGIN_NAME}] Only HTTP upstreams are supported; configure the DSH Web service to use HTTP`,
    );
  }
  const launchToken = config.bypassDshWebAuth
    ? resolveLaunchToken(ctx, target.origin)
    : undefined;
  const verifyAccessKey = authEnabled
    ? createAccessKeyVerifier(config.accessKey)
    : null;
  const proxy = createDshProxyServer(
    ctx,
    config,
    target,
    verifyAccessKey,
    launchToken,
  );
  ctx.effect(() => () => proxy.close(), `${PLUGIN_NAME}: proxy`);

  const displayHost = config.host.includes(":")
    ? `[${config.host}]`
    : config.host;
  let port: number;
  try {
    ({ port } = await proxy.listen(config.port, config.host));
  } catch (cause) {
    throw new Error(
      `[${PLUGIN_NAME}] failed to listen on ${displayHost}:${String(config.port)}`,
      { cause },
    );
  }
  if (ctx.fiber.uid === null) {
    return;
  }

  const message = `[${PLUGIN_NAME}] HTTP proxy listening on ${displayHost}:${String(port)}; forwarding to ${target.origin}`;
  console.info(message);
  ctx.logger.info(message);
  if (config.bypassDshWebAuth && !authEnabled) {
    const warning = `[${PLUGIN_NAME}] anyone who can reach this proxy can access DSH without credentials`;
    console.warn(warning);
    ctx.logger.warn(warning);
  }
}
