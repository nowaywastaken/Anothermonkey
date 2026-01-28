import { syncScripts } from "../lib/script-manager"
import { handleGMRequest } from "./api-handler"

console.log("AnotherMonkey Background Service Starting...")

// Listen for messages from UI to trigger sync and GM API calls
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "sync_scripts") {
    syncScripts().then(() => sendResponse({ status: "success" }))
    return true // async response
  }
  
  // Handle GM API calls
  if (message.action && message.action.startsWith("GM_")) {
      handleGMRequest(message, sender)
        .then(response => sendResponse(response))
        .catch(err => sendResponse({ error: err.message }));
      return true; // async response
  }
})

// Initial sync
syncScripts()

// Configure the User Script world
// @ts-ignore
if (chrome.userScripts && chrome.userScripts.configureWorld) {
    // @ts-ignore
    chrome.userScripts.configureWorld({
        messaging: true,
        csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; object-src 'none'"
    })
}
