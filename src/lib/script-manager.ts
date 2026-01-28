import { db } from "./db"
import { GM_API_CODE } from "./gm-api"
import type { UserScriptInjection } from "./types"

export async function syncScripts() {
  console.log("Syncing scripts to browser...")
  try {
    const scripts = await db.scripts.where("enabled").equals(true).toArray()
    
    // @ts-ignore
    if (!chrome.userScripts) {
        console.error("chrome.userScripts API is not available. Make sure you are on Chrome 120+ and have the permission.");
        return;
    }

    // Unregister all first
    // @ts-ignore
    const existing = await chrome.userScripts.getScripts()
    const existingIds = existing.map((s: any) => s.id)
    if (existingIds.length > 0) {
        // @ts-ignore
        await chrome.userScripts.unregister(existingIds)
    }

    const scriptsToRegister = scripts.map((script): UserScriptInjection => {
      // Prepend the script ID so the API knows which script is running
      const idInjection = `const GM_SCRIPT_ID = "${script.id}";\n`;
      const apiCode = idInjection + GM_API_CODE;

      return {
        id: script.id,
        matches: script.metadata.matches.length > 0 ? script.metadata.matches : ["<all_urls>"],
        excludeMatches: script.metadata.excludes,
        // We inject two blocks: API shim, then user code
        // Actually, userScripts API takes an array of code objects.
        // It executes them in order.
        js: [
            { code: apiCode },
            { code: script.code }
        ],
        runAt: script.metadata.runAt,
        world: "USER_SCRIPT"
      }
    })

    if (scriptsToRegister.length > 0) {
        // @ts-ignore
        await chrome.userScripts.register(scriptsToRegister)
    }
    
    console.log(`Synced ${scriptsToRegister.length} scripts.`)
  } catch (error) {
    console.error("Failed to sync scripts:", error)
  }
}
