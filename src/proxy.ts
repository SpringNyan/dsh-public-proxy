import type { Context } from "@deepseek-ai/cordis";
import { ProxyServer } from "httpxy";
import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { PLUGIN_NAME } from "./constants.js";

export function createProxyServer(
  ctx: Context,
  target: string,
): {
  listen(port: number, hostname?: string): Promise<void>;
  close(): Promise<void>;
} {
  const proxy = new ProxyServer({ target, changeOrigin: true });
  const rewriteOrigin = (headers: http.IncomingHttpHeaders): void => {
    if (headers.origin !== undefined) {
      headers.origin = target;
    }
  };
  const sockets = new Set<Duplex>();
  const server = http.createServer((req, res) => {
    rewriteOrigin(req.headers);
    proxy.web(req, res).catch((err: unknown) => {
      ctx.logger.error(`[${PLUGIN_NAME}] response error:`, err);
    });
  });
  proxy.on("error", (err, _req, res) => {
    ctx.logger.warn(`[${PLUGIN_NAME}] upstream error:`, err);
    if (res instanceof http.ServerResponse && !res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("proxy upstream error");
    } else if (res instanceof net.Socket) {
      res.destroy();
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
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
