import { Writable } from "node:stream";

export class FakeResponse extends Writable {
  statusCode = 0;
  statusMessage = "OK";
  headersSent = false;

  private readonly headerStore: Record<string, string | string[]> = {};
  private readonly chunks: Buffer[] = [];

  setHeader(key: string, value: string | string[] | number): void {
    this.headerStore[key.toLowerCase()] =
      typeof value === "number" ? String(value) : value;
  }

  getHeaders(): Record<string, string | string[]> {
    return { ...this.headerStore };
  }

  get body(): Buffer {
    return Buffer.concat(this.chunks);
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }
}
