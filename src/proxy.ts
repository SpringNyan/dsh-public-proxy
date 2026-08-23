import type { Context } from "@deepseek-ai/cordis";
import { ProxyServer } from "httpxy";
import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { PLUGIN_NAME } from "./constants.js";
import { FakeResponse } from "./fake-response.js";
import type { Config } from "./index.js";

interface PatchRule {
  match(path: string): boolean;
  replace: readonly (readonly [from: string, to: string])[];
}

const LOOPBACK_HOSTNAME_PATCH_RULE: PatchRule = {
  match: (path) =>
    path === "/plugins/@deepseek-ai/dsh-client-connection/client.js",
  replace: [
    [
      "function isLoopbackHostname(hostname) {",
      "function isLoopbackHostname(hostname) { return true;",
    ],
  ],
};

export function createProxyServer(
  ctx: Context,
  config: Config,
  target: string,
): {
  listen(port: number, hostname?: string): Promise<void>;
  close(): Promise<void>;
} {
  const allPatchRules = [
    config.applyLoopbackCheckPatch ? LOOPBACK_HOSTNAME_PATCH_RULE : null,
  ].filter((x) => x != null);
  const filterPatchRules = (req: http.IncomingMessage): PatchRule[] => {
    const path =
      req.url !== undefined ? new URL(req.url, "http://x").pathname : undefined;
    return path
      ? allPatchRules.filter((patchRule) => patchRule.match(path))
      : [];
  };

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

    rewriteOrigin(req.headers);
    const patchRules = filterPatchRules(req);
    const fakeRes = patchRules.length > 0 ? new FakeResponse() : null;
    proxy
      .web(req, (fakeRes ?? res) as http.ServerResponse)
      .then(() => {
        if (!fakeRes) {
          return;
        }
        if (!fakeRes.writableFinished) {
          return;
        }
        let body = fakeRes.body.toString();
        for (const patchRule of patchRules) {
          for (const [from, to] of patchRule.replace) {
            body = body.replaceAll(from, to);
          }
        }
        const headers = fakeRes.getHeaders();
        const contentLength = headers["content-length"];
        if (
          typeof contentLength === "string" ||
          typeof contentLength === "number"
        ) {
          headers["content-length"] = String(Buffer.byteLength(body));
        }
        res.writeHead(fakeRes.statusCode, fakeRes.statusMessage, headers);
        res.end(body);
      })
      .catch((err: unknown) => {
        ctx.logger.error(`[${PLUGIN_NAME}] response error:`, err);
      });
  });
  proxy.on("error", (err, req, res) => {
    ctx.logger.warn(`[${PLUGIN_NAME}] upstream error:`, err);
    if (res instanceof net.Socket) {
      res.destroy();
      return;
    }
    const realRes = req ? realResByReq.get(req) : undefined;
    if (realRes && !realRes.headersSent) {
      try {
        realRes.writeHead(502, { "content-type": "text/plain" });
        realRes.end("proxy upstream error");
      } catch {
        // the client already disconnected; nothing further to do
      }
    }
  });
  server.on("connection", (socket) => sockets.add(socket));
  server.on("upgrade", (req, socket, head) => {
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
          resolve();
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
