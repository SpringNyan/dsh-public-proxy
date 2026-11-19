import type { Context } from "@deepseek-ai/cordis";
import { ProxyServer, proxyFetch } from "httpxy";
import http from "node:http";
import net from "node:net";
import { Writable } from "node:stream";
import type { AccessKeyVerifier } from "./auth.js";
import {
  LOGIN_PAGE_HTML,
  buildAccessKeyClearCookie,
  buildAccessKeySetCookie,
  getAccessKeyFromCookie,
  getAccessKeyFromHeader,
  stripAccessKeyCookie,
  stripAccessKeyHeader,
} from "./auth.js";
import { LAUNCH_TOKEN_QUERY, PLUGIN_NAME } from "./constants.js";
import type { Config } from "./index.js";

function extractPathname(req: http.IncomingMessage): string {
  try {
    return new URL(req.url ?? "/", "http://x").pathname;
  } catch {
    return "";
  }
}

function respondBadGateway(res: http.ServerResponse): void {
  if (res.headersSent || res.writableEnded || res.destroyed) {
    if (res.headersSent && !res.writableEnded) {
      res.destroy();
    }
    return;
  }
  try {
    res.writeHead(502, {
      "content-type": "text/plain",
      connection: "close",
    });
    res.end("Unable to complete the request to DSH.");
  } catch {
    // the client already disconnected; nothing further to do
  }
}

function rejectUpgradeUnauthorized(socket: net.Socket): void {
  socket.once("error", () => socket.destroy());
  socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n", () =>
    socket.destroy(),
  );
}

function appendLaunchTokenQuery(reqUrl: string, token: string): string {
  const u = new URL(reqUrl, "http://x");
  u.searchParams.set(LAUNCH_TOKEN_QUERY, token);
  return `${u.pathname}${u.search}`;
}

export function createDshProxyServer(
  ctx: Context,
  config: Config,
  target: URL,
  verifyAccessKey: AccessKeyVerifier | null,
  launchToken?: string,
): {
  listen(port: number, hostname?: string): Promise<{ port: number }>;
  close(): Promise<void>;
} {
  const isAuthorized = (headers: http.IncomingHttpHeaders): boolean => {
    if (!verifyAccessKey) {
      return true;
    }
    return config.headerAuth
      ? verifyAccessKey(getAccessKeyFromHeader(headers))
      : verifyAccessKey(getAccessKeyFromCookie(headers));
  };

  const proxy = new ProxyServer({
    target: {
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ""),
      host: target.host,
      port: target.port || 80,
    },
    changeOrigin: true,
    autoRewrite: true,
  });
  const rewriteOrigin = (headers: http.IncomingHttpHeaders): void => {
    if (headers.origin) {
      headers.origin = target.origin;
    }
  };
  const sockets = new Set<net.Socket>();
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err: unknown) => {
      if (res.destroyed || res.writableEnded) {
        return;
      }
      ctx.logger.error(`[${PLUGIN_NAME}] failed to process HTTP request:`, err);
      respondBadGateway(res);
    });
  });

  async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const pathname = extractPathname(req);
    const isLoginRequest = req.method === "GET" && pathname === "/";

    if (verifyAccessKey) {
      const cookieMode = config.cookieAuth && !config.headerAuth;
      const cookieKey = cookieMode
        ? getAccessKeyFromCookie(req.headers)
        : undefined;
      if (!isAuthorized(req.headers)) {
        if (isLoginRequest && cookieMode) {
          if (cookieKey) {
            res.writeHead(401, {
              "content-type": "text/plain",
              "cache-control": "no-store",
              "set-cookie": [buildAccessKeyClearCookie()],
            });
            res.end("Invalid access key. Refresh this page to try again.");
          } else {
            res.writeHead(200, {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
            });
            res.end(LOGIN_PAGE_HTML);
          }
        } else {
          res.writeHead(401, { "content-type": "text/plain" });
          res.end(
            cookieMode
              ? "Access key missing or invalid. Open the homepage to sign in."
              : "Access key missing or invalid.",
          );
        }
        return;
      }
      stripAccessKeyCookie(req.headers);
      stripAccessKeyHeader(req.headers);
    }

    rewriteOrigin(req.headers);
    if (!isLoginRequest || (!verifyAccessKey && !config.bypassDshWebAuth)) {
      await proxy.web(req, res);
      return;
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
    }
    headers.set("host", target.host);

    const controller = new AbortController();
    const abort = (): void => {
      controller.abort();
    };
    res.once("close", abort);

    try {
      const forward = (url: string): Promise<Response> =>
        proxyFetch(
          {
            host: target.hostname.replace(/^\[|\]$/g, ""),
            port: Number(target.port) || 80,
          },
          new URL(url, target),
          { headers, signal: controller.signal },
        );

      let upstream = await forward(req.url ?? "/");
      if (config.bypassDshWebAuth && upstream.status === 401 && launchToken) {
        await upstream.body?.pipeTo(new WritableStream());
        upstream = await forward(
          appendLaunchTokenQuery(req.url ?? "/", launchToken),
        );
      }

      const cookies = upstream.headers.getSetCookie();
      if (
        config.cookieAuth &&
        !config.headerAuth &&
        verifyAccessKey &&
        upstream.status === 200
      ) {
        cookies.push(buildAccessKeySetCookie(config.accessKey));
      }
      res.writeHead(upstream.status, upstream.statusText, {
        ...Object.fromEntries(upstream.headers),
        "set-cookie": cookies,
      });
      if (upstream.body) {
        await upstream.body.pipeTo(Writable.toWeb(res), { preventAbort: true });
      } else {
        res.end();
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        ctx.logger.warn(`[${PLUGIN_NAME}] DSH Web request failed:`, err);
        respondBadGateway(res);
      }
    } finally {
      res.removeListener("close", abort);
    }
  }
  proxy.on("error", (err, _req, res) => {
    ctx.logger.warn(`[${PLUGIN_NAME}] proxy forwarding failed:`, err);
    if (res instanceof net.Socket) {
      res.destroy();
      return;
    }
    if (res) {
      respondBadGateway(res);
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  proxy.on("open", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (req, socket, head) => {
    if (verifyAccessKey) {
      if (!isAuthorized(req.headers)) {
        rejectUpgradeUnauthorized(socket as unknown as net.Socket);
        return;
      }
      stripAccessKeyCookie(req.headers);
      stripAccessKeyHeader(req.headers);
    }
    rewriteOrigin(req.headers);
    proxy
      .ws(req, socket as unknown as net.Socket, {}, head)
      .catch((err: unknown) => {
        if (socket.destroyed) {
          return;
        }
        ctx.logger.error(`[${PLUGIN_NAME}] WebSocket forwarding failed:`, err);
        socket.destroy();
      });
  });
  return {
    listen: (port, hostname) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
          server.removeListener("error", reject);
          server.on("error", (err) => {
            ctx.logger.error(`[${PLUGIN_NAME}] proxy listener error:`, err);
          });
          const address = server.address();
          resolve({
            port:
              typeof address === "object" && address !== null
                ? address.port
                : port,
          });
        });
      }),
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
      if (!server.listening) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
