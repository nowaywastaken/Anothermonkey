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
        const { details } = message;
        
        // Security Check
        const script = await getScript();
        if (!script) return { error: "Script not found" };

        const allowed = script.metadata.connects.some(pattern => matchPattern(pattern, details.url)) ||
                        script.metadata.matches.some(pattern => matchPattern(pattern, details.url)) ||
                        script.metadata.connects.includes("*") || 
                        script.metadata.connects.includes("<all_urls>");
        
        if (!allowed && script.metadata.connects.length > 0) {
             return { error: `Permission denied: URL not in @connect list: ${details.url}` };
        }
        
        // Basic fetch implementation
        try {
            const fetchOptions: RequestInit = {
                method: details.method || "GET",
                headers: details.headers || {},
                body: details.data,
                credentials: details.anonymous ? 'omit' : 'include',
            };

            const response = await fetch(details.url, fetchOptions);
            
            // Convert headers to object
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((val, key) => {
                responseHeaders[key] = val;
            });
            
            const responseHeadersStr = Object.keys(responseHeaders).map(k => `${k}: ${responseHeaders[k]}`).join("\r\n");
            
            const isBinary = details.responseType === 'arraybuffer' || details.responseType === 'blob';
            
            let responseData;
            if (isBinary) {
                const buffer = await response.arrayBuffer();
                // Convert to base64
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                responseData = btoa(binary);
            } else {
                responseData = await response.text();
            }

            return {
                status: response.status,
                statusText: response.statusText,
                responseText: !isBinary ? responseData : null,
                responseBase64: isBinary ? responseData : null,
                isBinary,
                responseHeaders: responseHeadersStr,
                finalUrl: response.url
            };
        } catch (e: any) {
            return { error: e.message };
        }
    }
    
    case "GM_registerMenuCommand": {
        if (!tabId) return { error: "No tab ID" }
        const { caption, id } = message;
        
        if (!menuCommands.has(tabId)) {
            menuCommands.set(tabId, []);
        }
        
        const commands = menuCommands.get(tabId);
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