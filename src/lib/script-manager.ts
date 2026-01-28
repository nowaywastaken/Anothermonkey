import { db } from "./db"
import { GM_API_CODE } from "./gm-api"
import { matchesUrl } from "./matcher"
import type { UserScript, UserScriptInjection } from "./types"

export async function syncScripts() {
  console.log("Syncing scripts to browser...")
  try {
    const scripts = await db.scripts.where("enabled").equals(1 as any).toArray()
    
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

    const scriptsToRegister = await Promise.all(scripts.map(async (script): Promise<UserScriptInjection> => {
      // Determine world: if @grant is none, it might want to be in MAIN world
      const isGrantNone = script.metadata.grants.length === 0 || 
                         (script.metadata.grants.length === 1 && script.metadata.grants[0] === "none");
      
      const world = (isGrantNone || script.preferredWorld === "MAIN") ? "MAIN" : "USER_SCRIPT";

      // Prepend the script ID so the API knows which script is running
      const idInjection = `const GM_SCRIPT_ID = "${script.id}";\n`;
      
      // Fetch values for this script to support sync GM_getValue
      const values = await db.values.where("scriptId").equals(script.id).toArray();
      const valueMap = values.reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {});
      
      // Prepare resources
      const resources: Record<string, { content?: string, url: string }> = {};
      script.metadata.resources.forEach((res: any) => {
          resources[res.name] = {
              url: res.url,
              content: script.dependencyCache?.[res.url]
          };
      });

      const dataInjection = `const GM_PRESET_VALUES = ${JSON.stringify(valueMap)};\nconst GM_PRESET_RESOURCES = ${JSON.stringify(resources)};\n`;
      
      const apiCode = idInjection + dataInjection + GM_API_CODE;

      const jsToInject = [];
      
      // 1. Add API shim
      jsToInject.push({ code: apiCode });
      
      // 2. Add @requires from cache
      script.metadata.requires.forEach((url: string) => {
          const content = script.dependencyCache?.[url];
          if (content) {
              jsToInject.push({ code: content });
          }
      });
      
      // 3. Add main script code with pre-check wrapper if necessary
      let finalCode = script.code;
      
      // We need a pre-check if there are any @include or @exclude rules,
      // or if there are regex-based @includes which forces a wide @match.
      const needsPreCheck = script.metadata.includes.length > 0 || script.metadata.excludes.length > 0;
      
      if (needsPreCheck) {
          const allIncludes = JSON.stringify(script.metadata.includes);
          const allExcludes = JSON.stringify(script.metadata.excludes);

          const wrapper = `
(function() {
  // This wrapper performs runtime checks for @include and @exclude rules.
  const currentUrl = window.location.href;
  const includes = ${allIncludes};
  const excludes = ${allExcludes};

  // The ANMON_matchPattern function is globally available from the injected GM_API code.
  const isIncluded = includes.length === 0 || includes.some(p => ANMON_matchPattern(p, currentUrl));
  const isExcluded = excludes.some(p => ANMON_matchPattern(p, currentUrl));

  if (isExcluded || !isIncluded) {
    return;
  }

  // If we've passed all checks, execute the original script code.
`;
          finalCode = wrapper + script.code + "\n})();";
      }


      jsToInject.push({ code: finalCode });

      return {
        id: script.id,
        matches: (script.metadata.matches.length > 0 || script.metadata.includes.length > 0) ? [...script.metadata.matches, ...script.metadata.includes.filter(i => !i.startsWith("/") || !i.endsWith("/"))] : ["<all_urls>"],
        // If it has regex includes, we MUST match <all_urls> to be safe, or at least be broad
        excludeMatches: script.metadata.excludes.filter(e => !e.startsWith("/") || !e.endsWith("/")),
        js: jsToInject,
        runAt: script.metadata.runAt,
        world: world as any
      }
    }))

    // If there are regex includes, we might need to broaden the matches to <all_urls>
    // but the userScripts API register call will handle the 'matches' field we provide.
    // Let's ensure if regex includes exist, we at least match all_urls if no glob matches are present.
    scriptsToRegister.forEach(s => {
        const script = scripts.find(orig => orig.id === s.id);
        if (script?.metadata.includes.some(i => i.startsWith("/") && i.endsWith("/"))) {
            if (!s.matches || s.matches.length === 0 || (s.matches.length === 1 && s.matches[0] === "")) {
                s.matches = ["<all_urls>"];
            }
        }
    });

    if (scriptsToRegister.length > 0) {
        // @ts-ignore
        await chrome.userScripts.register(scriptsToRegister)
        
        // Immediate injection for existing tabs
        for (const script of scripts) {
            await injectIntoExistingTabs(script);
        }
    }
    
    console.log(`Synced ${scriptsToRegister.length} scripts.`)
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
    const allTabs = await chrome.tabs.query({});
    
    const patternsToMatch = [...script.metadata.matches, ...script.metadata.includes];
    const patternsToExclude = script.metadata.excludes;

    for (const tab of allTabs) {
        if (!tab.id || !tab.url) continue;
        
        const shouldRun = (patternsToMatch.length === 0 || matchesUrl(patternsToMatch, tab.url)) && !matchesUrl(patternsToExclude, tab.url);

        if (!shouldRun) continue;
        
        // Basic check if already injected? 
        // Tampermonkey usually has a way to avoid double injection.
        // For now, we just try to inject.
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

            const dataInjection = `const GM_PRESET_VALUES = ${JSON.stringify(valueMap)};\nconst GM_PRESET_RESOURCES = ${JSON.stringify(resources)};\n`;
            const apiCode = idInjection + dataInjection + GM_API_CODE;
            
            let fullCode = apiCode + "\n";
            script.metadata.requires.forEach((url: string) => {
                const content = script.dependencyCache?.[url];
                if (content) fullCode += content + "\n";
            });
            fullCode += script.code;

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (code) => {
                    // A simple flag to avoid double injection in the same tab session
                    const injectionMarker = `ANMON_INJECTED_${script.id}`;
                    if ((window as any)[injectionMarker]) return;
                    (window as any)[injectionMarker] = true;

                    const scriptEl = document.createElement('script');
                    scriptEl.textContent = code;
                    (document.head || document.documentElement).appendChild(scriptEl);
                    scriptEl.remove();
                },
                args: [fullCode],
                world: "MAIN" // Using MAIN world for executeScript to have better access if needed, 
                             // but userScripts uses USER_SCRIPT world. 
                             // To be consistent with USER_SCRIPT world, we should use ISOLATED world.
                             // However, ISOLATED world cannot access MAIN world variables.
                             // The report suggests that executeScript fallback runs in ISOLATED world.
            });
        } catch (e) {
            // Ignore errors from injecting into privileged pages like chrome://
            if (!e.message.includes("Cannot access") && !e.message.includes("Missing host permission")) {
                 console.error(`Failed to inject into tab ${tab.id}:`, e);
            }
        }
    }
}
