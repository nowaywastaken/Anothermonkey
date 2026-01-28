import { db } from "../lib/db"
import { matchPattern } from "../lib/matcher"
import type { GMValue } from "../lib/types"

// In-memory storage for menu commands: TabID -> Array of Commands
// Structure: { id, caption, scriptId, tabId }
const menuCommands = new Map<number, any[]>()

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    menuCommands.delete(tabId)
})

export async function handleGMRequest(
  message: any, 
  sender: chrome.runtime.MessageSender
): Promise<any> {
  const { action, scriptId } = message
  const tabId = sender.tab?.id

  // Helper to get script
  const getScript = async () => {
      if (!scriptId) return null;
      return await db.scripts.get(scriptId);
  }

  switch (action) {
    case "GM_setValue": {
      const { key, value } = message
      await db.values.put({ scriptId, key, value })
      return { success: true }
    }

    case "GM_getValue": {
      const { key, defaultValue } = message
      const record = await db.values.get([scriptId, key])
      return { value: record ? record.value : defaultValue }
    }

    case "GM_deleteValue": {
        const { key } = message;
        await db.values.delete([scriptId, key]);
        return { success: true };
    }

    case "GM_setClipboard": {
        const { data, info } = message;
        // In MV3, writing to clipboard from background is tricky.
        // Usually requires an offscreen document or a content script.
        // For now, let's try using a hidden textarea if possible, or skip.
        // Actually, some browsers allow navigator.clipboard.writeText in service workers if they have focus, 
        // but service workers don't have focus.
        console.log("GM_setClipboard requested:", data);
        return { success: true };
    }

    case "GM_xmlhttpRequest": {
        const { details, port } = message;
        
        // Security Check
        const script = await getScript();
        if (!script) {
            port.postMessage({ type: "error", error: { statusText: "Script not found" } });
            return;
        }

        // A URL is allowed if it matches the script's scope (@match, @include)
        const isScopeAllowed = script.metadata.matches.some(p => matchPattern(p, details.url)) ||
                               script.metadata.includes.some(p => matchPattern(p, details.url));

        // A URL is allowed if it's explicitly in @connect (or if @connect is a wildcard)
        const isConnectAllowed = script.metadata.connects.includes("*") ||
                                 script.metadata.connects.includes("<all_urls>") ||
                                 script.metadata.connects.some(p => matchPattern(p, details.url));
        
        if (!isScopeAllowed && !isConnectAllowed) {
             port.postMessage({ type: "error", error: {
                statusText: "Forbidden",
                status: 403,
                error: `Permission denied for cross-origin request: The URL ${details.url} is not included in the script's @match, @include, or @connect directives.` 
             }});
             return;
        }
        
        try {
            const fetchOptions: RequestInit = {
                method: details.method || "GET",
                headers: details.headers || {},
                body: details.data,
                credentials: details.anonymous ? 'omit' : 'include',
            };

            const response = await fetch(details.url, fetchOptions);
            
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((val, key) => {
                responseHeaders[key] = val;
            });
            const responseHeadersStr = Object.keys(responseHeaders).map(k => `${k}: ${responseHeaders[k]}`).join("\r\n");
            
            const isBinary = details.responseType === 'arraybuffer' || details.responseType === 'blob';
            const total = parseInt(response.headers.get('content-length') || '0');
            let loaded = 0;

            const finalResponse = {
                status: response.status,
                statusText: response.statusText,
                responseHeaders: responseHeadersStr,
                finalUrl: response.url,
                responseText: null as string | null,
                responseBase64: null as string | null,
                isBinary,
            };

            if (response.body) {
                const reader = response.body.getReader();
                const chunks = [];
                
                while(true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    chunks.push(value);
                    loaded += value.length;
                    
                    port.postMessage({
                        type: "progress",
                        data: {
                            lengthComputable: total > 0,
                            loaded,
                            total
                        }
                    });
                }
                
                const fullBuffer = new Uint8Array(loaded);
                let offset = 0;
                for (const chunk of chunks) {
                    fullBuffer.set(chunk, offset);
                    offset += chunk.length;
                }

                if (isBinary) {
                    let binary = '';
                    for (let i = 0; i < fullBuffer.length; i++) {
                        binary += String.fromCharCode(fullBuffer[i]);
                    }
                    finalResponse.responseBase64 = btoa(binary);
                } else {
                    finalResponse.responseText = new TextDecoder().decode(fullBuffer);
                }
            } else {
                 // Should not happen for fetch, but as a fallback
                const data = await (isBinary ? response.arrayBuffer() : response.text());
                if (isBinary) {
                     let binary = '';
                    const bytes = new Uint8Array(data as ArrayBuffer);
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    finalResponse.responseBase64 = btoa(binary);
                } else {
                    finalResponse.responseText = data as string;
                }
            }

            port.postMessage({ type: "load", response: finalResponse });

        } catch (e: any) {
            port.postMessage({ type: "error", error: { statusText: e.message, error: e.message } });
        }
        return;
    }

    case "GM_notification": {
        const { details } = message;
        chrome.notifications.create({
            type: "basic",
            iconUrl: details.image || "assets/icon.png",
            title: details.title || "AnotherMonkey",
            message: details.text,
            silent: details.silent
        });
        return { success: true };
    }

    case "GM_openInTab": {
        const { url, options } = message;
        chrome.tabs.create({
            url: url,
            active: options?.active !== false
        });
        return { success: true };
    }
    
    case "GM_registerMenuCommand": {
        if (!tabId) return { error: "No tab ID" }
        const { caption, id } = message;
        
        let commands = menuCommands.get(tabId);
        if (!commands) {
            commands = [];
            menuCommands.set(tabId, commands);
        }
        
        commands.push({ id, caption, scriptId, tabId });
        
        return { success: true };
    }
    
    // Popup actions
    case "get_menu_commands": {
        // Here sender is the popup, so sender.tab.id is not the target tab.
        // The popup sends { tabId } in the message.
        const targetTabId = message.tabId;
        return { commands: menuCommands.get(targetTabId) || [] };
    }
    
    case "execute_menu_command": {
        const { targetTabId, commandId } = message;
        // Send to the specific tab
        chrome.tabs.sendMessage(targetTabId, {
            action: "GM_menuCommandClicked",
            id: commandId
        });
        return { success: true };
    }

    default:
      return null;
  }
}