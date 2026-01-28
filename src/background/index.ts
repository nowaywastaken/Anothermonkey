import { db } from "../lib/db"
import type { UserScript } from "../lib/types"

// Force standard logging
console.log("AnotherMonkey Background Service Starting...")

const syncScripts = async () => {
  console.log("Syncing scripts to browser...")
  try {
    const scripts = await db.scripts.where("enabled").equals(true).toArray()
    
    // Unregister all first (simplest approach for prototype)
    // In production, we should diff.
    // Note: chrome.userScripts.unregister requires ids. 
    // If we want to clear all, passing undefined might work or we track them.
    // Let's try to unregister all by getting existing ones first.
    
    // @ts-ignore - types might be missing for userScripts
    const existing = await chrome.userScripts.getScripts()
    const existingIds = existing.map((s: any) => s.id)
    if (existingIds.length > 0) {
        // @ts-ignore
        await chrome.userScripts.unregister(existingIds)
    }

    const scriptsToRegister = scripts.map((script) => ({
      id: script.id,
      matches: script.metadata.matches.length > 0 ? script.metadata.matches : ["<all_urls>"],
      excludeMatches: script.metadata.excludes,
      js: [{ code: script.code }],
      runAt: script.metadata.runAt,
      world: "USER_SCRIPT"
    }))

    if (scriptsToRegister.length > 0) {
        // @ts-ignore
        await chrome.userScripts.register(scriptsToRegister)
    }
    
    console.log(`Synced ${scriptsToRegister.length} scripts.`)
  } catch (error) {
    console.error("Failed to sync scripts:", error)
  }
}

// Listen for messages from UI to trigger sync
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "sync_scripts") {
    syncScripts().then(() => sendResponse({ status: "success" }))
    return true // async response
  }
})

// Initial sync
syncScripts()

// Configure the User Script world to allow eval if needed (optional for now, but good for compatibility)
// @ts-ignore
if (chrome.userScripts && chrome.userScripts.configureWorld) {
    // @ts-ignore
    chrome.userScripts.configureWorld({
        messaging: true,
        csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; object-src 'none'"
    })
}
