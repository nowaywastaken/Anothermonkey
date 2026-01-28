
import { db } from "../lib/db"
import { parseMetadata } from "../lib/parser";
import { syncScripts } from "../lib/script-manager";
import type { GMValue, UserScript } from "../lib/types";

async function checkPermissions(scriptId: string, permission: string): Promise<boolean> {
    const script = await db.scripts.get(scriptId);
    if (!script) return false;
    // @grant none scripts can only use GM_info
    if (permission !== "GM_info" && (script.metadata.grants.length === 0 || script.metadata.grants[0] === 'none')) {
        return false;
    }
    return script.metadata.grants.includes(permission) || script.metadata.grants.includes("unsafeWindow");
}

async function checkConnect(scriptId: string, url: string): Promise<boolean> {
    const script = await db.scripts.get(scriptId);
    if (!script) return false;
    if (script.metadata.connects.length === 0) return true; // No @connect means allow all
    
    // Allow self-origin and any @match/@include domains by default
    const allowedDomains = new Set([...script.metadata.connects, ...script.metadata.matches, ...script.metadata.includes]);
    
    try {
        const targetHost = new URL(url).hostname;
        for (const domain of allowedDomains) {
            // Simple domain match, wildcard support, or direct equality
            if (domain === '*' || targetHost === domain || (domain.startsWith('*') && targetHost.endsWith(domain.substring(1)))) {
                return true;
            }
        }
    } catch (e) {
        return false; // Invalid URL
    }

    return false;
}

export const xhrControllers: Map<string, AbortController> = new Map();

export async function handleGMRequest(
  message: any,
  sender: chrome.runtime.MessageSender
): Promise<any> {
  const { action, scriptId } = message
  
  // No scriptId for you, no service.
  if (!scriptId) {
      return { error: "Request is missing scriptId" };
  }

  // Most APIs require a tab context.
  const tabId = sender.tab?.id;

  switch (action) {
    case "GM_setValue": {
        if (!await checkPermissions(scriptId, "GM_setValue")) return { error: "Missing permission: GM_setValue" };
        const { key, value } = message;
        await db.values.put({ scriptId, key, value });
        return { success: true };
    }
    case "GM_deleteValue": {
        if (!await checkPermissions(scriptId, "GM_deleteValue")) return { error: "Missing permission: GM_deleteValue" };
        await db.values.delete([scriptId, message.key]);
        return { success: true };
    }

    case "GM_xmlhttpRequest": {
        if (!await checkPermissions(scriptId, "GM_xmlhttpRequest")) return { error: "Missing permission: GM_xmlhttpRequest" };
        const { details, requestId } = message;

        if (!await checkConnect(scriptId, details.url)) {
             const error = { name: "ConnectError", message: `Request to ${details.url} blocked by @connect rule.`};
             message.port.postMessage({ type: "error", error });

            // Create a notification to inform the user
            const notificationId = `connect-blocked::${scriptId}::${details.url}`;
            const script = await db.scripts.get(scriptId);
            chrome.notifications.create(notificationId, {
                type: "basic",
                iconUrl: chrome.runtime.getURL("assets/icon.png"),
                title: `[${script?.metadata.name}] Request Blocked`,
                message: `A request to ${details.url} was blocked. Click to manage script permissions.`,
                priority: 2
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
                credentials: details.anonymous ? 'omit' : 'include',
            });
            
            const responseHeaders = Array.from(response.headers.entries()).map(([key, value]) => `${key}: ${value}`).join("\n");
            
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("Could not get response reader.");
            }

            const contentLength = +(response.headers.get('Content-Length') || 0);
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
                    }
                });
            }

            const responseData = new Blob(chunks);
            let isBinary = false;
            let responseBase64 = null;
            let responseText = null;

            if (details.responseType === "blob" || details.responseType === "arraybuffer") {
                isBinary = true;
                const buffer = await responseData.arrayBuffer();
                const view = new Uint8Array(buffer);
                let binaryString = '';
                view.forEach(byte => { binaryString += String.fromCharCode(byte); });
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
                }
            });

        } catch (error) {
            port.postMessage({ type: "error", error: { name: error.name, message: error.message } });
        } finally {
            xhrControllers.delete(requestId);
        }
        break; // Request is handled via port messages, no direct return value
    }
    
    case "GM_notification": {
        if (!await checkPermissions(scriptId, "GM_notification")) return { error: "Missing permission: GM_notification" };
        const script = await db.scripts.get(scriptId);
        chrome.notifications.create({
            type: "basic",
            iconUrl: chrome.runtime.getURL("assets/icon.png"),
            title: message.details.title || script?.metadata.name || "AnotherMonkey Notification",
            message: message.details.text || "",
        });
        return { success: true };
    }
    
    case "GM_openInTab": {
        if (!await checkPermissions(scriptId, "GM_openInTab")) return { error: "Missing permission: GM_openInTab" };
        chrome.tabs.create({
            url: message.url,
            active: message.options?.active || false,
        });
        return { success: true };
    }

    case "GM_registerMenuCommand": {
        if (!await checkPermissions(scriptId, "GM_registerMenuCommand")) return { error: "Missing permission: GM_registerMenuCommand" };
        if (!tabId) return { error: "Cannot register menu command without a tab context."};
        
        const commandKey = `anmon-cmd::${scriptId}::${message.id}`;

        await chrome.contextMenus.create({
            id: commandKey,
            title: `[${(await db.scripts.get(scriptId))?.metadata.name}] ${message.caption}`,
            contexts: ["all"],
            documentUrlPatterns: ["<all_urls>"] // Show on all pages, let the script logic decide
        });
        
        // This is a bit tricky. We need a way to link context menu clicks back to the right tab.
        // We'll store the scriptId and commandId in the menu item ID.
        // The click handler will then message the appropriate tab.
        // This is handled in background/index.ts.
        
        return { success: true };
    }

    default:
      return { error: `Unknown action: ${action}` }
  }
}
