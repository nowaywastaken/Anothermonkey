import { db } from "./db"
import { GM_API_CODE } from "./gm-api"
import { matchesUrl } from "./matcher"
import type { UserScript, UserScriptInjection } from "./types"

export async function syncScripts() {
  console.log("Syncing scripts to browser...")
  try {
    if (!chrome.userScripts) {
      console.error(
        "chrome.userScripts API is not available. Make sure you are on Chrome 120+ and have the permission."
      )
      return
    }

    // 1. Get scripts from DB and browser
    const dbScripts = await db.scripts.where("enabled").equals(1 as any).toArray()
    const registeredScripts = await chrome.userScripts.getScripts()

    const dbScriptIds = new Set(dbScripts.map((s) => s.id))
    const registeredScriptIds = new Set(registeredScripts.map((s) => s.id))

    // 2. Determine scripts to add, update, and remove
    const scriptsToAdd = dbScripts.filter((s) => !registeredScriptIds.has(s.id))
    const scriptsToUpdate = dbScripts.filter((s) => registeredScriptIds.has(s.id))
    const scriptIdsToRemove = [...registeredScriptIds].filter(
      (id) => !dbScriptIds.has(id)
    )
    
    // 3. Helper to build registration object
    const buildRegistration = async (script: UserScript): Promise<chrome.userScripts.RegisteredUserScriptOptions> => {
       const isGrantNone = script.metadata.grants.length === 0 || 
                         (script.metadata.grants.length === 1 && script.metadata.grants[0] === "none");
      
      const world = (isGrantNone || script.preferredWorld === "MAIN") ? "MAIN" : "USER_SCRIPT";

      const idInjection = `const GM_SCRIPT_ID = "${script.id}";\n`;
      const values = await db.values.where("scriptId").equals(script.id).toArray();
      const valueMap = values.reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {});
      
      const resources: Record<string, { content?: string, url: string }> = {};
      script.metadata.resources.forEach((res: any) => {
          resources[res.name] = {
              url: res.url,
              content: script.dependencyCache?.[res.url]
          };
      });

      const infoInjection = `const GM_SCRIPT_METADATA = ${JSON.stringify(script.metadata)};\n`;
      const dataInjection = `const GM_PRESET_VALUES = ${JSON.stringify(valueMap)};\nconst GM_PRESET_RESOURCES = ${JSON.stringify(resources)};\n`;
      const apiCode = idInjection + infoInjection + dataInjection + GM_API_CODE;

      const jsToInject: {code: string}[] = [];
      jsToInject.push({ code: apiCode });
      
      script.metadata.requires.forEach((url: string) => {
          const content = script.dependencyCache?.[url];
          if (content) {
              jsToInject.push({ code: content });
          }
      });
      
      let finalCode = script.code;
      const needsPreCheck = script.metadata.includes.length > 0 || script.metadata.excludes.length > 0;
      if (needsPreCheck) {
          const allIncludes = JSON.stringify(script.metadata.includes);
          const allExcludes = JSON.stringify(script.metadata.excludes);
          const wrapper = `
(function() {
  const currentUrl = window.location.href;
  const includes = ${allIncludes};
  const excludes = ${allExcludes};
  const isIncluded = includes.length === 0 || includes.some(p => ANMON_matchPattern(p, currentUrl));
  const isExcluded = excludes.some(p => ANMON_matchPattern(p, currentUrl));
  if (isExcluded || !isIncluded) return;
`;
          finalCode = wrapper + script.code + "\n})();";
      }
      jsToInject.push({ code: finalCode });

      let matches = (script.metadata.matches.length > 0 || script.metadata.includes.length > 0) ? [...script.metadata.matches, ...script.metadata.includes.filter(i => !i.startsWith("/") || !i.endsWith("/"))] : ["<all_urls>"];
      if (script.metadata.includes.some(i => i.startsWith("/") && i.endsWith("/"))) {
          if (matches.length === 0 || (matches.length === 1 && matches[0] === "")) {
              matches = ["<all_urls>"];
          }
      }

      const registration: chrome.userScripts.RegisteredUserScriptOptions = {
        id: script.id,
        matches,
        excludeMatches: script.metadata.excludes.filter(e => !e.startsWith("/") || !e.endsWith("/")),
        js: jsToInject,
        runAt: script.metadata.runAt,
      };

      if (world === "MAIN") {
          registration.world = "MAIN";
      }
      return registration;
    }

    // 4. Perform API calls
    if (scriptIdsToRemove.length > 0) {
        await chrome.userScripts.unregister({ ids: scriptIdsToRemove });
        console.log(`Unregistered ${scriptIdsToRemove.length} scripts.`);
    }
    
    if (scriptsToAdd.length > 0) {
        const regs = await Promise.all(scriptsToAdd.map(buildRegistration));
        await chrome.userScripts.register(regs);
        console.log(`Registered ${scriptsToAdd.length} new scripts.`);
    }

    if (scriptsToUpdate.length > 0) {
        const regs = await Promise.all(scriptsToUpdate.map(buildRegistration));
        await chrome.userScripts.update(regs);
        console.log(`Updated ${scriptsToUpdate.length} existing scripts.`);
    }
    
    // 5. Immediate injection for all enabled scripts to ensure consistency
    for (const script of dbScripts) {
        await injectIntoExistingTabs(script);
    }
    
    console.log(`Sync complete. Added: ${scriptsToAdd.length}, Updated: ${scriptsToUpdate.length}, Removed: ${scriptIdsToRemove.length}.`)
  } catch (error) {
    console.error("Failed to sync scripts:", error)
  }
}

export async function checkForUpdates() {
    console.log("Checking for script updates...");
    const scripts = await db.scripts.toArray();
    
    for (const script of scripts) {
        const updateUrl = script.metadata.updateURL || script.metadata.downloadURL;
        if (!updateUrl) continue;
        
        try {
            const response = await fetch(updateUrl);
            if (!response.ok) continue;
            
            const code = await response.text();
            const { parseMetadata } = await import("./parser");
            const newMetadata = parseMetadata(code);
            
            if (isNewerVersion(newMetadata.version, script.metadata.version)) {
                console.log(`Updating script: ${script.metadata.name} (${script.metadata.version} -> ${newMetadata.version})`);
                
                // Fetch new dependencies if any
                const dependencies: Record<string, string> = {};
                const toFetch = [
                    ...newMetadata.requires.map(url => ({ url, type: 'require' })),
                    ...newMetadata.resources.map(res => ({ url: res.url, type: 'resource' }))
                ];

                await Promise.all(toFetch.map(async (item) => {
                    try {
                        const res = await fetch(item.url);
                        if (res.ok) dependencies[item.url] = await res.text();
                    } catch (e) {
                        console.error(`Failed to fetch dependency ${item.url}:`, e);
                    }
                }));

                await db.scripts.update(script.id, {
                    code,
                    metadata: newMetadata,
                    lastModified: Date.now(),
                    dependencyCache: {
                        ...script.dependencyCache,
                        ...dependencies
                    }
                });
            }
        } catch (error) {
            console.error(`Failed to update script ${script.metadata.name}:`, error);
        }
    }
    
    await syncScripts();
}

function isNewerVersion(newVer: string, oldVer: string): boolean {
    const n = newVer.split('.').map(Number);
    const o = oldVer.split('.').map(Number);
    
    for (let i = 0; i < Math.max(n.length, o.length); i++) {
        const nv = n[i] || 0;
        const ov = o[i] || 0;
        if (nv > ov) return true;
        if (nv < ov) return false;
    }
    return false;
}

async function injectIntoExistingTabs(script: UserScript) {
    const allTabs = await chrome.tabs.query({
        // Avoid injecting into URLs that are not supported like chrome://, about:, etc.
        url: ["http://*/*", "https://*/*", "file://*/*"]
    });
    
    const patternsToMatch = [...script.metadata.matches, ...script.metadata.includes];
    const patternsToExclude = script.metadata.excludes;

    for (const tab of allTabs) {
        if (!tab.id || !tab.url) continue;
        
        const shouldRun = (patternsToMatch.length === 0 || matchesUrl(patternsToMatch, tab.url)) && !matchesUrl(patternsToExclude, tab.url);

        if (!shouldRun) continue;
        
        try {
            // We need to inject the API code + requires + script code
            const idInjection = `const GM_SCRIPT_ID = "${script.id}";\n`;
            
            // Fetch values for this script to support sync GM_getValue
            const values = await db.values.where("scriptId").equals(script.id).toArray();
            const valueMap = values.reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {});
            
            const resources: Record<string, { content?: string, url: string }> = {};
            script.metadata.resources.forEach((res: any) => {
                resources[res.name] = {
                    url: res.url,
                    content: script.dependencyCache?.[res.url]
                };
            });

            const infoInjection = `const GM_SCRIPT_METADATA = ${JSON.stringify(script.metadata)};\n`;
            const dataInjection = `const GM_PRESET_VALUES = ${JSON.stringify(valueMap)};\nconst GM_PRESET_RESOURCES = ${JSON.stringify(resources)};\n`;
            const apiCode = idInjection + infoInjection + dataInjection + GM_API_CODE;
            
            let fullCode = apiCode + "\n";
            script.metadata.requires.forEach((url: string) => {
                const content = script.dependencyCache?.[url];
                if (content) fullCode += content + "\n";
            });
            fullCode += script.code;

            // Background script can keep a map of tabId -> Set<scriptId> of injected scripts
            // to prevent double injection more reliably. For now, we omit the check as `executeScript`
            // can be called multiple times without side effects in many cases.
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (code) => {
                    try {
                        // Directly execute the code in the isolated world.
                        eval(code);
                    } catch (e) {
                        console.error("Error executing script in isolated world:", e);
                    }
                },
                args: [fullCode],
                world: "ISOLATED"
            });
        } catch (e) {
            // Ignore errors from injecting into privileged pages.
            // The url filter in chrome.tabs.query should prevent most of these.
            if (!e.message.includes("Cannot access") && !e.message.includes("Missing host permission") && !e.message.includes("No tab with id")) {
                 console.error(`Failed to inject script "${script.metadata.name}" into tab ${tab.id}:`, e);
            }
        }
    }
}
