import { syncScripts, checkForUpdates } from "../lib/script-manager"
import { handleGMRequest } from "./api-handler"

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
    if (port.name === "GM_xmlhttpRequest") {
        port.onMessage.addListener(async (message) => {
            if (message.action === "GM_xmlhttpRequest") {
                try {
                    // We call handleGMRequest but it needs to know it's a port-based call
                    // to potentially send progress updates.
                    // For now, we'll just handle it directly here or pass the port.
                    const response = await handleGMRequest({ ...message, port }, port.sender as chrome.runtime.MessageSender);
                    port.postMessage({ type: "load", response });
                } catch (error: any) {
                    port.postMessage({ type: "error", error: error.message });
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
