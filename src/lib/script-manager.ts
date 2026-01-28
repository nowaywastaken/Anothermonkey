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

    const scriptsToRegister = await Promise.all(scripts.map(async (script): Promise<UserScriptInjection> => {
      // Prepend the script ID so the API knows which script is running
      const idInjection = `const GM_SCRIPT_ID = "${script.id}";\n`;
      
      // Fetch values for this script to support sync GM_getValue
      const values = await db.values.where("scriptId").equals(script.id).toArray();
      const valueMap = values.reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {});
      
      // Prepare resources
      const resources: Record<string, { content?: string, url: string }> = {};
      script.metadata.resources.forEach(res => {
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
      script.metadata.requires.forEach(url => {
          const content = script.dependencyCache?.[url];
          if (content) {
              jsToInject.push({ code: content });
          }
      });
      
      // 3. Add main script code with pre-check wrapper
      let finalCode = script.code;
      
      const hasRegexInclude = script.metadata.includes.some(i => i.startsWith("/") && i.endsWith("/"));
      const hasAnyInclude = script.metadata.includes.length > 0;
      const hasAnyExclude = script.metadata.excludes.length > 0;
      
      if (hasRegexInclude || (hasAnyInclude && script.metadata.matches.length === 0) || hasAnyExclude) {
          const includeRegexes = script.metadata.includes.filter(i => i.startsWith("/") && i.endsWith("/"));
          const includeGlobs = script.metadata.includes.filter(i => !i.startsWith("/") || !i.endsWith("/"));
          const excludeRegexes = script.metadata.excludes.filter(e => e.startsWith("/") && e.endsWith("/"));
          const excludeGlobs = script.metadata.excludes.filter(e => !e.startsWith("/") || !e.endsWith("/"));
          
          let wrapper = "(function() {\n";
          wrapper += "  const currentUrl = window.location.href;\n";
          wrapper += "  function matchGlob(pattern, url) {\n";
          wrapper += "    if (pattern === '<all_urls>') return true;\n";
          wrapper += "    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\\\\\\\\]|\\\\]/g, '\\\\$&').replace(/\\\\*/g, '.*') + '$');\n";
          wrapper += "    return regex.test(url);\n";
          wrapper += "  }\n";
          
          if (hasAnyInclude) {
              wrapper += "  const incRegexes = [" + includeRegexes.join(", ") + "];\n";
              wrapper += "  const incGlobs = " + JSON.stringify(includeGlobs) + ";\n";
              wrapper += "  const matchedRegex = incRegexes.length > 0 && incRegexes.some(re => re.test(currentUrl));\n";
              wrapper += "  const matchedGlob = incGlobs.length > 0 && incGlobs.some(g => matchGlob(g, currentUrl));\n";
              wrapper += "  if (!matchedRegex && !matchedGlob && (incRegexes.length + incGlobs.length > 0)) return;\n";
          }
          
          wrapper += "  const excRegexes = [" + excludeRegexes.join(", ") + "];\n";
          wrapper += "  const excGlobs = " + JSON.stringify(excludeGlobs) + ";\n";
          wrapper += "  if (excRegexes.some(re => re.test(currentUrl))) return;\n";
          wrapper += "  if (excGlobs.some(g => matchGlob(g, currentUrl))) return;\n";
          
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
        world: "USER_SCRIPT"
      }
    }))

    // If there are regex includes, we might need to broaden the matches to <all_urls>
    // but the userScripts API register call will handle the 'matches' field we provide.
    // Let's ensure if regex includes exist, we at least match all_urls if no glob matches are present.
    scriptsToRegister.forEach(s => {
        const script = scripts.find(orig => orig.id === s.id);
        if (script?.metadata.includes.some(i => i.startsWith("/") && i.endsWith("/"))) {
            if (s.matches.length === 0 || (s.matches.length === 1 && s.matches[0] === "")) {
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

async function injectIntoExistingTabs(script: any) {
    const tabs = await chrome.tabs.query({ url: script.metadata.matches });
    
    for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        
        // Basic check if already injected? 
        // Tampermonkey usually has a way to avoid double injection.
        // For now, let's just try to inject.
        try {
            // We need to inject the API code + requires + script code
            const idInjection = `const GM_SCRIPT_ID = "${script.id}";\n`;
            
            // Fetch values for this script to support sync GM_getValue
            const values = await db.values.where("scriptId").equals(script.id).toArray();
            const valueMap = values.reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {});
            
            const resources: Record<string, { content?: string, url: string }> = {};
            script.metadata.resources.forEach(res => {
                resources[res.name] = {
                    url: res.url,
                    content: script.dependencyCache?.[res.url]
                };
            });

            const dataInjection = `const GM_PRESET_VALUES = ${JSON.stringify(valueMap)};\nconst GM_PRESET_RESOURCES = ${JSON.stringify(resources)};\n`;
            const apiCode = idInjection + dataInjection + GM_API_CODE;
            
            let fullCode = apiCode + "\n";
            script.metadata.requires.forEach(url => {
                const content = script.dependencyCache?.[url];
                if (content) fullCode += content + "\n";
            });
            fullCode += script.code;

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (code) => {
                    // Check for double injection
                    if ((window as any).GM_API_INJECTED) return;
                    (window as any).GM_API_INJECTED = true;

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
            console.error(`Failed to inject into tab ${tab.id}:`, e);
        }
    }
}
