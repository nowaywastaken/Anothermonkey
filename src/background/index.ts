import { syncScripts, checkForUpdates } from "../lib/script-manager"
import { handleGMRequest, xhrControllers } from "./api-handler"

console.log("AnotherMonkey Background Service Starting...")

// Listen for messages from UI to trigger sync and GM API calls
let pendingScriptCode: string | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "sync_scripts") {
    syncScripts().then(() => sendResponse({ status: "success" }))
    return true // async response
  }
  
  if (message.action === "open_install_dialog") {
      pendingScriptCode = message.code;
      chrome.tabs.create({ url: "tabs/install.html" });
      sendResponse({ success: true });
      return false;
  }
  
  if (message.action === "get_pending_script") {
      sendResponse({ code: pendingScriptCode });
      // clear it? Maybe not yet, in case of refresh.
      return false;
  }
  
  // Handle GM API calls
  if (message.action && message.action.startsWith("GM_")) {
      handleGMRequest(message, sender)
        .then(response => sendResponse(response))
        .catch(err => sendResponse({ error: err.message }));
      return true; // async response
  }
})

// Listen for long-lived connections (for GM_xmlhttpRequest)
chrome.runtime.onConnect.addListener((port) => {
    let requestId: string | null = null;
    if (port.name === "GM_xmlhttpRequest") {
        port.onMessage.addListener(async (message) => {
            if (message.action === "GM_xmlhttpRequest") {
                requestId = message.requestId;
                // The handler will now be responsible for posting all messages to the port.
                await handleGMRequest({ ...message, port }, port.sender as chrome.runtime.MessageSender);
            } else if (message.action === "abort" && requestId) {
                const controller = xhrControllers.get(requestId);
                if (controller) {
                    controller.abort();
                    xhrControllers.delete(requestId);
                }
            }
        });
        port.onDisconnect.addListener(() => {
            if (requestId) {
                 const controller = xhrControllers.get(requestId);
                if (controller) {
                    controller.abort();
                    xhrControllers.delete(requestId);
                }
            }
        });
    }
});

// Listen for alarms (for periodic update checks)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "check_updates") {
        checkForUpdates();
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id || !(typeof info.menuItemId === 'string') || !info.menuItemId.startsWith('anmon-cmd::')) return;
    
    const parts = (info.menuItemId as string).split("::");
    const commandId = parts[2];

    if (commandId) {
        chrome.tabs.sendMessage(tab.id, {
            action: "GM_menuCommandClicked",
            id: commandId
        }).catch(e => console.debug("Could not send menu click to tab, it might have been closed.", e));
    }
});

// Set up periodic update check (e.g., every 24 hours)
chrome.alarms.create("check_updates", { periodInMinutes: 24 * 60 });

// Initial sync
syncScripts()
checkForUpdates() // Also check on startup

// Configure the User Script world
if (chrome.userScripts && chrome.userScripts.configureWorld) {
    chrome.userScripts.configureWorld({
        messaging: true,
        csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; object-src 'none'"
    })
}
