import { parseCookie, stringifyCookie, stringifySetCookie } from "cookie";
import type http from "node:http";
import { PLUGIN_NAME } from "./constants.js";

export const ACCESS_KEY_COOKIE = `${PLUGIN_NAME.replaceAll("-", "_")}_access_key`;

export const LOGIN_PAGE_HTML = `<!doctype html><script>(function(){var KEY=${JSON.stringify(
  ACCESS_KEY_COOKIE,
)};var input=window.prompt("Please enter the access key:","");if(input){document.cookie=KEY+"="+encodeURIComponent(input)+"; path=/; samesite=strict"}location.reload()})();</script>`;

export type AccessKeyVerifier = (value: string | undefined) => boolean;
export function createAccessKeyVerifier(accessKey: string): AccessKeyVerifier {
  return (value) => value === accessKey;
}

export function getAccessKeyFromHeaders(
  headers: http.IncomingHttpHeaders,
): string | undefined {
  const cookie = headers.cookie;
  if (!cookie) {
    return undefined;
  }
  return parseCookie(cookie)[ACCESS_KEY_COOKIE];
}

export function stripAccessKeyFromHeaders(
  headers: http.IncomingHttpHeaders,
): void {
  const cookie = headers.cookie;
  if (!cookie) {
    return;
  }

  const parsed = parseCookie(cookie);
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete parsed[ACCESS_KEY_COOKIE];

  const keptCookie = stringifyCookie(parsed);
  if (!keptCookie) {
    delete headers.cookie;
  } else {
    headers.cookie = keptCookie;
  }
}

const ACCESS_KEY_COOKIE_MAX_AGE_DAYS = 30;

export function buildAccessKeySetCookie(value: string | null): string {
  const maxAgeSeconds = ACCESS_KEY_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const obj = {
    name: ACCESS_KEY_COOKIE,
    value: value ?? "",
    path: "/",
    httpOnly: true,
    sameSite: "strict",
  } as const;

  return value
    ? stringifySetCookie({
        ...obj,
        maxAge: maxAgeSeconds,
        expires: new Date(Date.now() + maxAgeSeconds * 1000),
      })
    : stringifySetCookie({
        ...obj,
        expires: new Date(0),
      });
}
