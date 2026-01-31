import { db } from "../lib/db";
import { parseMetadata } from "../lib/parser";
import { syncScripts } from "../lib/script-manager";
import type { GMValue, UserScript } from "../lib/types";

async function checkPermissions(
  scriptId: string,
  permission: string,
): Promise<boolean> {
  const script = await db.scripts.get(scriptId);
  if (!script) return false;
  // @grant none scripts can only use GM_info
  if (
    permission !== "GM_info" &&
    (script.metadata.grants.length === 0 ||
      script.metadata.grants[0] === "none")
  ) {
    return false;
  }
  return (
    script.metadata.grants.includes(permission) ||
    script.metadata.grants.includes("unsafeWindow")
  );
}

// Blocked domains for security
const BLOCKED_DOMAINS = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

// Suspicious TLDs that require special validation
const SUSPICIOUS_TLDS = [".tk", ".ml", ".ga", ".cf", ".pw"];

async function checkConnect(scriptId: string, url: string): Promise<boolean> {
  const script = await db.scripts.get(scriptId);
  if (!script) return false;

  try {
    const targetUrl = new URL(url);
    const targetHost = targetUrl.hostname;

    // Block internal/private IPs and suspicious domains
    if (BLOCKED_DOMAINS.includes(targetHost) || isPrivateIP(targetHost)) {
      return false;
    }

    // Check for suspicious TLDs
    if (SUSPICIOUS_TLDS.some((tld) => targetHost.endsWith(tld))) {
      // Require explicit permission for suspicious TLDs
      const userPerm = await db.permissions.get([scriptId, targetHost]);
      if (!userPerm || !userPerm.allow) {
        return false;
      }
    }

    // No @connect means restrictive default (not allow all)
    if (script.metadata.connects.length === 0) {
      // Only allow if explicitly in @match/@include
      const allowedDomains = new Set([
        ...script.metadata.matches,
        ...script.metadata.includes,
      ]);
      for (const domain of allowedDomains) {
        if (
          domain === "*" ||
          targetHost === domain ||
          (domain.startsWith("*") && targetHost.endsWith(domain.substring(1)))
        ) {
          return true;
        }
      }
      return false;
    }

    // Check static metadata permissions
    const allowedDomains = new Set([
      ...script.metadata.connects,
      ...script.metadata.matches,
      ...script.metadata.includes,
    ]);
    for (const domain of allowedDomains) {
      if (
        domain === "*" ||
        targetHost === domain ||
        (domain.startsWith("*") && targetHost.endsWith(domain.substring(1)))
      ) {
        return true;
      }
    }

    // Check dynamic user-granted permissions
    const userPerm = await db.permissions.get([scriptId, targetHost]);
    if (userPerm && userPerm.allow) {
      return true;
    }
  } catch (e) {
    return false; // Invalid URL
  }

  return false;
}

// Check if hostname is a private IP address
function isPrivateIP(hostname: string): boolean {
  // Remove port if present
  const host = hostname.split(":")[0];

  // IPv4 private ranges
  const ipv4Private = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./, // Link-local
  ];

  // IPv6 private ranges
  const ipv6Private = [
    /^fe80:/, // Link-local
    /^fc00:/, // Unique local
    /^::1$/, // localhost
  ];

  // Check 127.0.0.0/8 (Loopback)
  if (/^127\./.test(host)) return true;

  return (
    ipv4Private.some((regex) => regex.test(host)) ||
    ipv6Private.some((regex) => regex.test(host))
  );
}

export const xhrControllers: Map<string, AbortController> = new Map();

// Track active downloads with their ports for progress streaming
export const downloadPorts: Map<string, chrome.runtime.Port> = new Map();

// Cookie ports for callback communication
export const cookiePorts: Map<string, chrome.runtime.Port> = new Map();

// Convert chrome cookies to simplified format
function simplifyCookie(cookie: chrome.cookies.Cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expirationDate: cookie.expirationDate,
    session: cookie.session,
    hostOnly: cookie.hostOnly,
    sameSite: cookie.sameSite,
  };
}

export async function handleGMRequest(
  message: any,
  sender: chrome.runtime.MessageSender,
): Promise<any> {
  const { action, scriptId } = message;

  // No scriptId for you, no service.
  if (!scriptId) {
    return { error: "Request is missing scriptId" };
  }

  // Most APIs require a tab context.
  const tabId = sender.tab?.id;

  switch (action) {
    case "GM_setValue": {
      if (!(await checkPermissions(scriptId, "GM_setValue")))
        return { error: "Missing permission: GM_setValue" };
      const { key, value } = message;
      await db.values.put({ scriptId, key, value });
      return { success: true };
    }
    case "GM_deleteValue": {
      if (!(await checkPermissions(scriptId, "GM_deleteValue")))
        return { error: "Missing permission: GM_deleteValue" };
      await db.values.delete([scriptId, message.key]);
      return { success: true };
    }

    case "GM_xmlhttpRequest": {
      if (!(await checkPermissions(scriptId, "GM_xmlhttpRequest")))
        return { error: "Missing permission: GM_xmlhttpRequest" };
      const { details, requestId } = message;

      if (!(await checkConnect(scriptId, details.url))) {
        const error = {
          name: "ConnectError",
          message: `Request to ${details.url} blocked by @connect rule.`,
        };
        message.port.postMessage({ type: "error", error });

        // Create a notification to inform the user
        const notificationId = `connect-blocked::${scriptId}::${details.url}`;
        const script = await db.scripts.get(scriptId);
        chrome.notifications.create(notificationId, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("assets/icon.png"),
          title: `[${script?.metadata.name}] Request Blocked`,
          message: `A request to ${details.url} was blocked. Click to manage script permissions.`,
          priority: 2,
        });

        return;
      }

      const controller = new AbortController();
      xhrControllers.set(requestId, controller);

      const port = message.port; // The long-lived connection port

      try {
        const response = await fetch(details.url, {
          method: details.method || "GET",
          headers: details.headers,
          body: details.data,
          signal: controller.signal,
          // Default to 'omit' for CSRF protection, only include credentials if explicitly requested
          credentials: details.withCredentials ? "include" : "omit",
        });

        const responseHeaders = Array.from(response.headers.entries())
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n");

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Could not get response reader.");
        }

        const contentLength = +(response.headers.get("Content-Length") || 0);
        let loaded = 0;
        let chunks = [];

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          chunks.push(value);
          loaded += value.length;

          port.postMessage({
            type: "progress",
            data: {
              lengthComputable: contentLength > 0,
              loaded,
              total: contentLength,
            },
          });
        }

        const responseData = new Blob(chunks);
        let isBinary = false;
        let responseBase64 = null;
        let responseText = null;

        if (
          details.responseType === "blob" ||
          details.responseType === "arraybuffer"
        ) {
          isBinary = true;
          const buffer = await responseData.arrayBuffer();
          const view = new Uint8Array(buffer);
          let binaryString = "";
          view.forEach((byte) => {
            binaryString += String.fromCharCode(byte);
          });
          responseBase64 = btoa(binaryString);
        } else {
          responseText = await responseData.text();
        }

        port.postMessage({
          type: "load",
          response: {
            finalUrl: response.url,
            status: response.status,
            statusText: response.statusText,
            responseHeaders,
            responseText,
            isBinary,
            responseBase64,
          },
        });
      } catch (error: unknown) {
        port.postMessage({
          type: "error",
          error: {
            name: (error as Error).name,
            message: (error as Error).message,
          },
        });
      } finally {
        xhrControllers.delete(requestId);
      }
      break; // Request is handled via port messages, no direct return value
    }

    case "GM_notification": {
      if (!(await checkPermissions(scriptId, "GM_notification")))
        return { error: "Missing permission: GM_notification" };

      // Check notification permission
      if (!chrome.notifications || !chrome.notifications.create) {
        return { error: "Notifications not supported or permission denied" };
      }

      const script = await db.scripts.get(scriptId);
      const notificationId = `gm-notification::${scriptId}::${message.details.notificationId || Date.now()}`;

      // Store notification info for event routing
      if (
        message.details.onclick ||
        message.details.ondone ||
        message.details.buttons
      ) {
        const notificationInfo: { [key: string]: any } = {
          scriptId,
          tabId,
          onclick: message.details.onclick,
          ondone: message.details.ondone,
          buttons: message.details.buttons,
          // Add timestamp for TTL cleanup
          createdAt: Date.now(),
        };
        await chrome.storage.local.set({
          [`notif_${notificationId}`]: notificationInfo,
        });

        // Schedule cleanup after 5 minutes if notification callbacks weren't triggered
        setTimeout(
          async () => {
            try {
              await chrome.storage.local.remove(`notif_${notificationId}`);
            } catch {
              /* ignore cleanup errors */
            }
          },
          5 * 60 * 1000,
        );
      }

      // Build notification options
      const options: chrome.notifications.NotificationOptions = {
        type:
          message.details.buttons && message.details.buttons.length > 0
            ? "basic"
            : "basic",
        iconUrl:
          message.details.imageUrl || chrome.runtime.getURL("assets/icon.png"),
        title:
          message.details.title ||
          script?.metadata.name ||
          "AnotherMonkey Notification",
        message: message.details.text || "",
        priority: 1,
        eventTime: message.details.timeout
          ? Date.now() + message.details.timeout
          : undefined,
      };

      // Add buttons if provided (max 2 for chrome.notifications)
      if (message.details.buttons && message.details.buttons.length > 0) {
        options.buttons = message.details.buttons
          .slice(0, 2)
          .map((btn: { title: string }) => ({
            title: btn.title,
          }));
      }

      try {
        await chrome.notifications.create(notificationId, options);

        // Set timeout to auto-close if specified
        if (message.details.timeout && message.details.timeout > 0) {
          setTimeout(
            () => {
              chrome.notifications.clear(notificationId);
            },
            Math.min(message.details.timeout, 30000),
          ); // Max 30 seconds
        }

        return { success: true, notificationId };
      } catch (error) {
        return {
          error: `Failed to create notification: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    case "GM_openInTab": {
      if (!(await checkPermissions(scriptId, "GM_openInTab")))
        return { error: "Missing permission: GM_openInTab" };
      chrome.tabs.create({
        url: message.url,
        active: message.options?.active || false,
      });
      return { success: true };
    }

    case "GM_registerMenuCommand": {
      if (!(await checkPermissions(scriptId, "GM_registerMenuCommand")))
        return { error: "Missing permission: GM_registerMenuCommand" };
      if (!tabId)
        return { error: "Cannot register menu command without a tab context." };

      const commandKey = `anmon-cmd::${scriptId}::${message.id}`;
      const script = await db.scripts.get(scriptId);

      await chrome.contextMenus.create({
        id: commandKey,
        title: `[${script?.metadata.name}] ${message.caption}`,
        contexts: ["all"],
        documentUrlPatterns: ["<all_urls>"], // Show on all pages, let the script logic decide
      });

      // Save command to storage for popup to query
      const result = await chrome.storage.local.get("menuCommands");
      const commands = (result.menuCommands || []) as Array<{
        id: string;
        scriptId: string;
        caption: string;
        scriptName: string;
      }>;

      // Remove existing command with same id if any
      const filteredCommands = commands.filter(
        (c) => c.id !== message.id || c.scriptId !== scriptId,
      );
      filteredCommands.push({
        id: message.id,
        scriptId,
        caption: message.caption,
        scriptName: script?.metadata.name || "Unknown",
      });
      await chrome.storage.local.set({ menuCommands: filteredCommands });

      return { success: true };
    }

    case "GM_download": {
      if (!(await checkPermissions(scriptId, "GM_download")))
        return { error: "Missing permission: GM_download" };
      const { details, downloadId } = message;

      if (!(await checkConnect(scriptId, details.url))) {
        const error = {
          name: "ConnectError",
          message: `Download from ${details.url} blocked by @connect rule.`,
        };
        message.port.postMessage({ type: "error", error });

        // Create a notification to inform the user
        const notificationId = `download-connect-blocked::${scriptId}::${details.url}`;
        const script = await db.scripts.get(scriptId);
        chrome.notifications.create(notificationId, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("assets/icon.png"),
          title: `[${script?.metadata.name}] Download Blocked`,
          message: `A download from ${details.url} was blocked. Click to manage script permissions.`,
          priority: 2,
        });

        return;
      }

      const port = message.port;
      downloadPorts.set(downloadId, port);

      try {
        const downloadOptions: chrome.downloads.DownloadOptions = {
          url: details.url,
          filename: details.name,
          saveAs: details.saveAs,
          headers: details.headers
            ? Object.entries(details.headers).map(([name, value]) => ({
                name,
                value: value as string,
              }))
            : undefined,
        };

        const newDownloadId = await chrome.downloads.download(downloadOptions);
        port.postMessage({
          type: "downloadStarted",
          downloadId: newDownloadId,
        });
      } catch (error) {
        port.postMessage({
          type: "error",
          error: {
            name: "DownloadError",
            message: error instanceof Error ? error.message : String(error),
          },
        });
        downloadPorts.delete(downloadId);
      }
      return; // Download is handled via port messages and callbacks
    }

    case "abort": {
      // Handle abort for downloads
      if (message.downloadId && xhrControllers.has(message.downloadId)) {
        xhrControllers.get(message.downloadId)?.abort();
        xhrControllers.delete(message.downloadId);
      }
      return { success: true };
    }

    case "GM_cookie": {
      if (!(await checkPermissions(scriptId, "GM_cookie"))) {
        message.port.postMessage({
          type: "error",
          error: {
            name: "PermissionError",
            message: "Missing permission: GM_cookie",
          },
        });
        return;
      }

      const { cookieAction, details, cookieId } = message;
      const port = message.port;
      cookiePorts.set(cookieId, port);

      try {
        // Validate URL is allowed by @connect
        if (!details.url || !(await checkConnect(scriptId, details.url))) {
          port.postMessage({
            type: "error",
            error: {
              name: "ConnectError",
              message: `Cookie access to ${details.url} blocked by @connect rule.`,
            },
          });
          cookiePorts.delete(cookieId);
          return;
        }

        const storeId = details.storeId || "default";
        const cookieDetails: chrome.cookies.SetDetails = {
          url: details.url,
          name: details.name,
          value: details.value,
          domain: details.domain,
          path: details.path || "/",
          secure: details.secure || false,
          httpOnly: details.httpOnly || false,
          expirationDate: details.expirationDate,
          storeId: storeId,
        };

        if (cookieAction === "list") {
          // List cookies matching the criteria
          const getAllDetails: chrome.cookies.GetAllDetails = {
            url: details.url,
            name: details.name,
            domain: details.domain,
            storeId: storeId,
          };

          const cookies = await chrome.cookies.getAll(getAllDetails);
          const simplifiedCookies = cookies.map(simplifyCookie);
          port.postMessage({ type: "success", result: simplifiedCookies });
        } else if (cookieAction === "set") {
          // Set/create a cookie
          const cookie = await chrome.cookies.set(cookieDetails);
          if (cookie) {
            port.postMessage({
              type: "success",
              result: simplifyCookie(cookie),
            });
          } else {
            port.postMessage({
              type: "error",
              error: { name: "CookieError", message: "Failed to set cookie" },
            });
          }
        } else if (cookieAction === "delete") {
          // Delete a cookie by name
          if (!details.name) {
            port.postMessage({
              type: "error",
              error: {
                name: "CookieError",
                message: "Cookie name is required for delete action",
              },
            });
            cookiePorts.delete(cookieId);
            return;
          }

          const removed = await chrome.cookies.remove({
            url: details.url,
            name: details.name,
            storeId: storeId,
          });

          if (removed) {
            port.postMessage({
              type: "success",
              result: { success: true, name: removed.name },
            });
          } else {
            port.postMessage({
              type: "error",
              error: {
                name: "CookieError",
                message: "Cookie not found or could not be deleted",
              },
            });
          }
        } else {
          port.postMessage({
            type: "error",
            error: {
              name: "CookieError",
              message: `Unknown cookie action: ${cookieAction}`,
            },
          });
        }
      } catch (error: unknown) {
        port.postMessage({
          type: "error",
          error: {
            name: "CookieError",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        cookiePorts.delete(cookieId);
      }
      return;
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}
