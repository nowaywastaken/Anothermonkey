import { syncScripts, checkForUpdates } from "../lib/script-manager"
import { handleGMRequest, xhrControllers, downloadPorts } from "./api-handler"

console.log("AnotherMonkey Background Service Starting...")

// Type for notification info stored in storage
interface NotificationInfo {
    scriptId: string;
    tabId?: number;
    onclick?: boolean;
    ondone?: boolean;
    buttons?: Array<{ title: string }>;
}

// Listen for messages from UI to trigger sync and GM API calls
let pendingScriptCode: string | null = null;

interface MessagePayload {
  action?: string;
  code?: string;
  requestId?: string;
  downloadId?: string;
  [key: string]: unknown;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as MessagePayload;
  if (msg.action === "sync_scripts") {
    syncScripts().then(() => sendResponse({ status: "success" }))
    return true // async response
  }
  
  if (msg.action === "open_install_dialog") {
      pendingScriptCode = msg.code as string | null;
      chrome.tabs.create({ url: "tabs/install.html" });
      sendResponse({ success: true });
      return false;
  }
  
  if (msg.action === "get_pending_script") {
      sendResponse({ code: pendingScriptCode });
      // clear it? Maybe not yet, in case of refresh.
      return false;
  }
  
  // Handle GM API calls
  if (msg.action && typeof msg.action === 'string' && msg.action.startsWith("GM_")) {
      handleGMRequest(msg, sender)
        .then(response => sendResponse(response))
        .catch(err => sendResponse({ error: err.message }));
      return true; // async response
  }
})

// Listen for long-lived connections (for GM_xmlhttpRequest and GM_download)
chrome.runtime.onConnect.addListener((port) => {
    let requestId: string | null = null;
    let downloadId: string | null = null;
    
    if (port.name === "GM_xmlhttpRequest") {
        port.onMessage.addListener(async (message: unknown) => {
            const msg = message as MessagePayload;
            if (msg.action === "GM_xmlhttpRequest") {
                requestId = msg.requestId as string;
                // The handler will now be responsible for posting all messages to the port.
                await handleGMRequest({ ...msg, port }, port.sender as chrome.runtime.MessageSender);
            } else if (msg.action === "abort" && requestId) {
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
    } else if (port.name.startsWith("GM_download_")) {
        downloadId = port.name.replace("GM_download_", "");
        
        port.onMessage.addListener(async (message: unknown) => {
            const msg = message as MessagePayload;
            if (msg.action === "GM_download") {
                await handleGMRequest({ ...msg, port }, port.sender as chrome.runtime.MessageSender);
            } else if (msg.action === "abort" && msg.downloadId) {
                // Abort the download
                chrome.downloads.cancel(msg.downloadId as unknown as number);
                downloadPorts.delete(downloadId!);
            }
        });
        
        port.onDisconnect.addListener(() => {
            if (downloadId) {
                downloadPorts.delete(downloadId);
            }
        });
    }
});

// Download progress tracking
const downloadProgress: Map<number, { currentBytes: number; totalBytes: number }> = new Map();

chrome.downloads.onChanged.addListener((downloadDelta) => {
    const port = downloadPorts.get(String(downloadDelta.id));
    if (!port) return;
    
    if (downloadDelta.bytesReceived && downloadDelta.totalBytes) {
        downloadProgress.set(downloadDelta.id, {
            currentBytes: downloadDelta.bytesReceived.current,
            totalBytes: downloadDelta.totalBytes.current
        });
        
        port.postMessage({
            type: "progress",
            data: {
                lengthComputable: true,
                loaded: downloadDelta.bytesReceived.current,
                total: downloadDelta.totalBytes.current
            }
        });
    }
});

// Download completion handler
chrome.downloads.onCompleted.addListener((downloadItem) => {
    const port = downloadPorts.get(String(downloadItem.id));
    if (!port) return;
    
    port.postMessage({
        type: "load",
        result: {
            downloadId: downloadItem.id,
            filename: downloadItem.filename,
            url: downloadItem.url,
            totalBytes: downloadItem.totalBytes,
            mimeType: downloadItem.mimeType
        }
    });
    
    downloadPorts.delete(String(downloadItem.id));
    downloadProgress.delete(downloadItem.id);
});

// Download error handler
chrome.downloads.onError.addListener((downloadItem) => {
    const port = downloadPorts.get(String(downloadItem.id));
    if (!port) return;
    
    port.postMessage({
        type: "error",
        error: {
            name: "DownloadError",
            message: downloadItem.error || "Unknown download error"
        }
    });
    
    downloadPorts.delete(String(downloadItem.id));
    downloadProgress.delete(downloadItem.id);
});

// Listen for alarms (for periodic update checks)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "check_updates") {
        checkForUpdates();
    }
});

chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab) => {
    if (!tab?.id || !(typeof info.menuItemId === 'string') || !info.menuItemId.startsWith('anmon-cmd::')) return;
    
    const parts = (info.menuItemId as string).split("::");
    const commandId = parts[2];

    if (commandId) {
        chrome.tabs.sendMessage(tab.id, {
            action: "GM_menuCommandClicked",
            id: commandId
        }).catch((e) => console.debug("Could not send menu click to tab, it might have been closed.", e));
    }
});

// Listener for notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
    if (typeof notificationId !== 'string') return;
    
    // Handle built-in notifications (connect-blocked, download-connect-blocked)
    if (notificationId.startsWith('connect-blocked::') || notificationId.startsWith('download-connect-blocked::')) {
        const parts = notificationId.split('::');
        const scriptId = parts[1];
        const url = parts.slice(2).join('::');
        const domain = new URL(url).hostname;
        
        chrome.tabs.create({ url: `tabs/permission.html?scriptId=${scriptId}&domain=${domain}` });
        chrome.notifications.clear(notificationId);
        return;
    }
    
    // Handle GM notifications
    if (notificationId.startsWith('gm-notification::')) {
        const storageKey = `notif_${notificationId}`;
        const result = await chrome.storage.local.get(storageKey);
        const notifInfo = result[storageKey] as NotificationInfo | undefined;
        
        if (notifInfo?.onclick && notifInfo?.tabId) {
            // Send click event to content script
            chrome.tabs.sendMessage(notifInfo.tabId, {
                action: "GM_notificationClick",
                notificationId: notificationId.split('::').pop()
            }).catch((e) => console.debug("Could not send notification click to tab", e));
        }
        
        chrome.notifications.clear(notificationId);
    }
});

// Listener for notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    if (typeof notificationId !== 'string' || !notificationId.startsWith('gm-notification::')) return;
    
    const storageKey = `notif_${notificationId}`;
    const result = await chrome.storage.local.get(storageKey);
    const notifInfo = result[storageKey] as NotificationInfo | undefined;
    
    if (notifInfo?.buttons && notifInfo?.tabId) {
        // Send button click event to content script
        chrome.tabs.sendMessage(notifInfo.tabId, {
            action: "GM_notificationButton",
            notificationId: notificationId.split('::').pop(),
            buttonIndex
        }).catch((e) => console.debug("Could not send notification button click to tab", e));
    }
    
    chrome.notifications.clear(notificationId);
});

// Listener for notification close
chrome.notifications.onClosed.addListener(async (notificationId, byUser) => {
    if (typeof notificationId !== 'string' || !notificationId.startsWith('gm-notification::')) return;
    
    const storageKey = `notif_${notificationId}`;
    const result = await chrome.storage.local.get(storageKey);
    const notifInfo = result[storageKey] as NotificationInfo | undefined;
    
    if (notifInfo?.ondone && notifInfo?.tabId) {
        // Send close event to content script
        chrome.tabs.sendMessage(notifInfo.tabId, {
            action: "GM_notificationClosed",
            notificationId: notificationId.split('::').pop(),
            byUser
        }).catch((e) => console.debug("Could not send notification close to tab", e));
    }
    
    // Clean up storage
    await chrome.storage.local.remove(storageKey);
});

// Set up periodic update check with configurable frequency
const DEFAULT_UPDATE_INTERVAL_MINUTES = 24 * 60; // 24 hours

async function setupUpdateAlarm() {
  const result = await chrome.storage.local.get("updateCheckIntervalMinutes");
  const intervalMinutes = (result.updateCheckIntervalMinutes as number) || DEFAULT_UPDATE_INTERVAL_MINUTES;
  
  // Clear existing alarm and create new one with updated interval
  chrome.alarms.clear("check_updates", () => {
    chrome.alarms.create("check_updates", { periodInMinutes: intervalMinutes });
    console.log(`Update check alarm set for every ${intervalMinutes} minutes`);
  });
}

// Listen for messages to configure update frequency
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as { action?: string; intervalMinutes?: number };
  
  if (msg.action === "configure_update_check" && msg.intervalMinutes) {
    chrome.storage.local.set({ updateCheckIntervalMinutes: msg.intervalMinutes })
      .then(() => {
        setupUpdateAlarm();
        sendResponse({ status: "success" });
      });
    return true; // async response
  }
  
  if (msg.action === "get_update_check_interval") {
    chrome.storage.local.get("updateCheckIntervalMinutes").then((result) => {
      sendResponse({ 
        intervalMinutes: (result.updateCheckIntervalMinutes as number) || DEFAULT_UPDATE_INTERVAL_MINUTES 
      });
    });
    return true; // async response
  }
});

// Set up update alarm with configurable frequency
setupUpdateAlarm();

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
