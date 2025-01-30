/**
 * Copyright (c) Streamlit Inc. (2018-2022) Snowflake Inc. (2022-2025)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Remove once support for URLPattern is added to all major browsers
// https://caniuse.com/mdn-api_urlpattern
import "urlpattern-polyfill"

import take from "lodash/take"

import { IS_DEV_ENV, WEBSOCKET_PORT_DEV } from "~lib/baseconsts"

const FINAL_SLASH_RE = /\/+$/
const INITIAL_SLASH_RE = /^\/+/

/**
 * Return the BaseUriParts for the global window
 */
export function getWindowBaseUriParts(): URL {
  const currentUrl = new URL(window.location.href)
  // If dev, always connect to 8501, since window.location.port is the Node
  // server's port 3000.
  // If changed, also change config.py

  if (IS_DEV_ENV) {
    currentUrl.port = WEBSOCKET_PORT_DEV
  } else if (!currentUrl.port) {
    currentUrl.port = isHttps() ? "443" : "80"
  }

  currentUrl.pathname = currentUrl.pathname
    .replace(FINAL_SLASH_RE, "")
    .replace(INITIAL_SLASH_RE, "")

  return currentUrl
}

// NOTE: In the multipage apps world, there is some ambiguity around whether a
// path like "foo/bar" means
//   * the page "/" at baseUrlPath "foo/bar", or
//   * the page "/bar" at baseUrlPath "foo".
// To resolve this, we just try both possibilities for now, but this leads to
// the unfortunate consequence of the initial page load when navigating directly
// to a non-main page of an app being slower than navigating to the main page
// (as the first attempt at connecting to the server fails the healthcheck).
//
// We'll want to improve this situation in the near future, but figuring out
// the best path forward may be tricky as I wasn't able to come up with an
// easy solution covering every deployment scenario.
export function getPossibleBaseUris(): Array<URL> {
  const baseUriParts = getWindowBaseUriParts()
  const { pathname } = baseUriParts

  if (pathname === "/") {
    return [baseUriParts]
  }

  const parts = pathname.split("/")
  const possibleBaseUris: Array<URL> = []

  while (parts.length > 0) {
    const newURL = new URL(baseUriParts)
    newURL.pathname = parts.join("/")
    possibleBaseUris.push(newURL)
    parts.pop()
  }

  return take(possibleBaseUris, 2)
}

/**
 * Create a ws:// or wss:// URI for the given path.
 */
export function buildWsUri(
  { hostname, port, pathname }: URL,
  path: string
): string {
  const protocol = isHttps() ? "wss" : "ws"
  const fullPath = makePath(pathname, path)
  return `${protocol}://${hostname}:${port}/${fullPath}`
}

/**
 * Create an HTTP URI for the given path.
 */
export function buildHttpUri(
  { hostname, port, pathname }: URL,
  path: string
): string {
  const protocol = isHttps() ? "https" : "http"
  const fullPath = makePath(pathname, path)
  return `${protocol}://${hostname}:${port}/${fullPath}`
}

export function makePath(basePath: string, subPath: string): string {
  basePath = basePath.replace(FINAL_SLASH_RE, "").replace(INITIAL_SLASH_RE, "")
  subPath = subPath.replace(FINAL_SLASH_RE, "").replace(INITIAL_SLASH_RE, "")

  if (basePath.length === 0) {
    return subPath
  }

  return `${basePath}/${subPath}`
}

/**
 * True if we're connected to the host via HTTPS.
 */
function isHttps(): boolean {
  return window.location.href.startsWith("https://")
}

/**
 * Check if the given origin follows the allowed origin pattern, which could
 * include wildcards.
 *
 * This function is used to check whether cross-origin messages received by the
 * withHostCommunication component come from an origin that we've listed as
 * trusted. If this function returns false against the origin being tested for
 * all trusted origins in our whitelist, the cross-origin message should be
 * ignored.
 */
export function isValidOrigin(
  allowedOriginPattern: string,
  testOrigin: string
): boolean {
  let allowedUrlPattern: URLPattern
  let allowedPortLessPattern: URLPattern
  let testUrl: URL

  try {
    allowedUrlPattern = new URLPattern(allowedOriginPattern)
    allowedPortLessPattern = new URLPattern({
      protocol: allowedUrlPattern.protocol,
      hostname: allowedUrlPattern.hostname,
    })
    testUrl = new URL(testOrigin)
  } catch {
    return false
  }

  // Allow localhost w/ any port for testing of host <-> guest communication
  // using hostframe.html (facilitates manual & e2e testing)
  if (
    testUrl.hostname === "localhost" &&
    allowedPortLessPattern.test(testUrl)
  ) {
    return true
  }

  return allowedUrlPattern.test(testUrl)
}
