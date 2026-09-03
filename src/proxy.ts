import type { Context } from "@deepseek-ai/cordis";
import { ProxyServer } from "httpxy";
import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import type { AccessKeyVerifier } from "./auth.js";
import {
  LOGIN_PAGE_HTML,
  buildAccessKeySetCookie,
  createAccessKeyVerifier,
  getAccessKeyFromHeaders,
  stripAccessKeyFromHeaders,
} from "./auth.js";
import { LAUNCH_TOKEN_QUERY, PLUGIN_NAME } from "./constants.js";
import { FakeResponse } from "./fake-response.js";
import type { Config } from "./index.js";

interface PatchRule {
  match(url: string): boolean;
  replace: readonly (readonly [from: string, to: string])[];
}

const LOOPBACK_HOSTNAME_PATCH_RULE: PatchRule = {
  match: (url) => {
    const target = "@deepseek-ai/dsh-client-connection/client.js";
    let parsed: URL;
    try {
      parsed = new URL(url, "http://x");
    } catch {
      return false;
    }
    if (parsed.pathname === `/plugins/${target}`) {
      return true;
    }
    if (parsed.pathname === "/plugins/") {
      for (const [key] of parsed.searchParams) {
        if (key.startsWith("?") && key.slice(1).split(",").includes(target)) {
          return true;
        }
      }
    }
    return false;
  },
  replace: [
    [
      "function isLoopbackHostname(hostname) {",
      "function isLoopbackHostname(hostname) { return true;",
    ],
  ],
};

function extractPathname(req: http.IncomingMessage): string {
  try {
    return new URL(req.url ?? "/", "http://x").pathname;
  } catch {
    return "";
  }
}

function respondBadGateway(res: http.ServerResponse): void {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  try {
    res.writeHead(502, {
      "content-type": "text/plain",
      connection: "close",
    });
    res.end("proxy upstream error");
  } catch {
    // the client already disconnected; nothing further to do
  }
}

function isIndexPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html";
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

export function createProxyServer(
  ctx: Context,
  config: Config,
  target: string,
  launchTokenProvider?: () => string | null,
): {
  listen(port: number, hostname?: string): Promise<{ port: number }>;
  close(): Promise<void>;
} {
  const allPatchRules = [
    config.applyIsLoopbackPatch ? LOOPBACK_HOSTNAME_PATCH_RULE : null,
  ].filter((x) => x != null);
  const filterPatchRules = (url: string): PatchRule[] =>
    allPatchRules.filter((patchRule) => patchRule.match(url));

  const verifyAccess: AccessKeyVerifier | null = config.enableCookieAuth
    ? createAccessKeyVerifier(config.accessKey)
    : null;

  const proxy = new ProxyServer({ target, changeOrigin: true });
  const rewriteOrigin = (headers: http.IncomingHttpHeaders): void => {
    if (headers.origin) {
      headers.origin = target;
    }
  };
  const realResByReq = new WeakMap<http.IncomingMessage, http.ServerResponse>();
  const sockets = new Set<Duplex>();
  const server = http.createServer((req, res) => {
    realResByReq.set(req, res);
    res.on("close", () => {
      realResByReq.delete(req);
    });
    handleRequest(req, res).catch((err: unknown) => {
      ctx.logger.error(`[${PLUGIN_NAME}] response error:`, err);
      respondBadGateway(res);
    });
  });

  async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const pathname = extractPathname(req);
    const isIndex = isIndexPath(pathname);

    if (verifyAccess) {
      const accessKey = getAccessKeyFromHeaders(req.headers);
      if (!verifyAccess(accessKey)) {
        if (isIndex) {
          if (accessKey) {
            res.writeHead(401, {
              "content-type": "text/plain",
              "cache-control": "no-store",
              "set-cookie": [buildAccessKeySetCookie(null)],
            });
            res.end("access key is invalid");
          } else {
            res.writeHead(200, {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
            });
            res.end(LOGIN_PAGE_HTML);
          }
        } else {
          res.writeHead(401, { "content-type": "text/plain" });
          res.end("unauthorized");
        }
        return;
      }
      stripAccessKeyFromHeaders(req.headers);
    }

    rewriteOrigin(req.headers);
    const patchRules = filterPatchRules(req.url ?? "");
    let fakeRes =
      req.method === "GET" &&
      ((isIndex && (verifyAccess || config.bypassLaunchToken)) ||
        patchRules.length > 0)
        ? new FakeResponse()
        : null;
    if (fakeRes) {
      delete req.headers["accept-encoding"];
    }

    await proxy.web(req, (fakeRes ?? res) as http.ServerResponse);
    if (
      config.bypassLaunchToken &&
      isIndex &&
      req.method === "GET" &&
      fakeRes?.statusCode === 401
    ) {
      const token = launchTokenProvider?.();
      if (token) {
        const retryReq = new http.IncomingMessage(new net.Socket());
        retryReq.method = req.method;
        retryReq.url = appendLaunchTokenQuery(req.url ?? "", token);
        retryReq.headers = { ...req.headers };
        retryReq.push(null);
        realResByReq.set(retryReq, res);
        fakeRes = new FakeResponse();
        try {
          await proxy.web(retryReq, fakeRes as unknown as http.ServerResponse);
        } finally {
          retryReq.destroy();
        }
      }
    }

    if (!fakeRes) {
      return;
    }
    if (!fakeRes.writableFinished) {
      respondBadGateway(res);
      return;
    }
    const headers = fakeRes.getHeaders();
    if (verifyAccess && isIndex && fakeRes.statusCode === 200) {
      const existingSetCookie = headers["set-cookie"];
      headers["set-cookie"] = [
        ...(typeof existingSetCookie === "string"
          ? [existingSetCookie]
          : (existingSetCookie ?? [])),
        buildAccessKeySetCookie(config.accessKey),
      ];
    }
    let body = fakeRes.body;
    if (fakeRes.statusCode === 200) {
      let text = body.toString();
      for (const patchRule of patchRules) {
        for (const [from, to] of patchRule.replace) {
          text = text.replaceAll(from, to);
        }
      }
      body = Buffer.from(text);
      const contentLength = headers["content-length"];
      if (
        typeof contentLength === "string" ||
        typeof contentLength === "number"
      ) {
        headers["content-length"] = String(body.byteLength);
      }
    }
    res.writeHead(fakeRes.statusCode, fakeRes.statusMessage, headers);
    res.end(body);
  }
  proxy.on("error", (err, req, res) => {
    ctx.logger.warn(`[${PLUGIN_NAME}] upstream error:`, err);
    if (res instanceof net.Socket) {
      res.destroy();
      return;
    }
    const realRes = req ? realResByReq.get(req) : undefined;
    if (realRes) {
      respondBadGateway(realRes);
    }
  });
  server.on("connection", (socket) => sockets.add(socket));
  server.on("upgrade", (req, socket, head) => {
    if (verifyAccess) {
      if (!verifyAccess(getAccessKeyFromHeaders(req.headers))) {
        rejectUpgradeUnauthorized(socket as net.Socket);
        return;
      }
      stripAccessKeyFromHeaders(req.headers);
    }
    rewriteOrigin(req.headers);
    proxy.ws(req, socket as net.Socket, {}, head).catch((err: unknown) => {
      ctx.logger.error(`[${PLUGIN_NAME}] ws error:`, err);
      socket.destroy();
    });
  });
  return {
    listen: (port, hostname) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
          server.removeListener("error", reject);
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
