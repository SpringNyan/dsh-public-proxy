import { parseCookie, stringifySetCookie } from "cookie";
import { timingSafeEqual } from "node:crypto";
import type http from "node:http";
import { PLUGIN_NAME } from "./constants.js";

export const ACCESS_KEY_COOKIE = `${PLUGIN_NAME}-access-key`;

export const ACCESS_KEY_HEADER = `x-${PLUGIN_NAME}-access-key`;

export const LOGIN_PAGE_HTML = `<!doctype html><script>(function(){var KEY=${JSON.stringify(
  ACCESS_KEY_COOKIE,
)};var input=window.prompt("Enter the access key:","");if(!input)return;document.cookie=KEY+"="+encodeURIComponent(input)+"; path=/; samesite=lax";location.reload()})();</script>`;

export type AccessKeyVerifier = (value: string | undefined) => boolean;
export function createAccessKeyVerifier(accessKey: string): AccessKeyVerifier {
  const expected = Buffer.from(accessKey);
  return (value) => {
    if (!value) {
      return false;
    }
    const actual = Buffer.from(value);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  };
}

export function getAccessKeyFromCookie(
  headers: http.IncomingHttpHeaders,
): string | undefined {
  const cookie = headers.cookie;
  if (!cookie) {
    return undefined;
  }
  return parseCookie(cookie)[ACCESS_KEY_COOKIE];
}

export function getAccessKeyFromHeader(
  headers: http.IncomingHttpHeaders,
): string | undefined {
  const value = headers[ACCESS_KEY_HEADER];
  return Array.isArray(value) ? value[0] : value;
}

export function stripAccessKeyCookie(headers: http.IncomingHttpHeaders): void {
  const cookie = headers.cookie;
  if (!cookie) {
    return;
  }

  const keptCookie = cookie
    .split(";")
    .filter((part) => parseCookie(part)[ACCESS_KEY_COOKIE] === undefined)
    .join(";");
  if (!keptCookie.trim()) {
    delete headers.cookie;
  } else {
    headers.cookie = keptCookie;
  }
}

export function stripAccessKeyHeader(headers: http.IncomingHttpHeaders): void {
  Reflect.deleteProperty(headers, ACCESS_KEY_HEADER);
}

const ACCESS_KEY_COOKIE_MAX_AGE_DAYS = 30;

const ACCESS_KEY_COOKIE_ATTRIBUTES = {
  name: ACCESS_KEY_COOKIE,
  path: "/",
  httpOnly: true,
  sameSite: "lax",
} as const;

export function buildAccessKeySetCookie(value: string): string {
  const maxAgeSeconds = ACCESS_KEY_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  return stringifySetCookie({
    ...ACCESS_KEY_COOKIE_ATTRIBUTES,
    value,
    maxAge: maxAgeSeconds,
    expires: new Date(Date.now() + maxAgeSeconds * 1000),
  });
}

export function buildAccessKeyClearCookie(): string {
  return stringifySetCookie({
    ...ACCESS_KEY_COOKIE_ATTRIBUTES,
    value: "",
    expires: new Date(0),
  });
}
