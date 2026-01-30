import { db } from "./db"
import { GM_API_CODE } from "./gm-api"
import { matchesUrl } from "./matcher"
import type { UserScript, ScriptMetadata } from "./types"

export interface UpdateCheckResult {
    scriptId: string;
    scriptName: string;
    currentVersion: string;
    newVersion: string;
    newCode: string;
    newMetadata: ScriptMetadata;
}

const MATCHER_CODE = [
  "(function() {",
  "  function patternToRegExp(pattern) {",
  "    if (pattern === '<all_urls>') {",
  "      return /^(https?|file|ftp):\\/\\/.*/;",
  "    }",
  "    const match = /^(https?|\\*|file|ftp):\\/\\/([^\\/]+)(\\/.*)$/.exec(pattern);",
  "    if (!match) {",
  "      throw new Error('Invalid match pattern: ' + pattern);",
  "    }",
  "    let [, scheme, host, path] = match;",
  "    let re = '^' + (scheme === '*' ? 'https?' : scheme) + ':\\\\/\\\\/';",
  "    if (host === '*') {",
  "      re += '[^/]+';",
  "    } else if (host.startsWith('*.')) {",
  "      re += '[^/]+\\\\.' + host.substring(2).replace(/\\./g, '\\\\.');",
  "    } else {",
  "      re += host.replace(/\\./g, '\\\\.');",
  "    }",
  "    re += path.replace(/[?.+^${}()|[\\\\\\]]/g, '\\\\$&').replace(/\\\\*/g, '.*');",
  "    re += '$';",
  "    return new RegExp(re);",
  "  }",
  "  window.ANMON_matchPattern = function(pattern, url) {",
  "    if (pattern === '*') return true;",
  "    if (pattern === '<all_urls>') {",
  "      return /^(https?|file|ftp):\\/\\//.test(url);",
  "    }",
  "    if (pattern.startsWith('/') && pattern.endsWith('/')) {",
  "      try {",
  "        const regex = new RegExp(pattern.substring(1, pattern.length - 1));",
  "        return regex.test(url);",
  "      } catch (e) { return false; }",
  "    }",
  "    if (pattern.includes('://')) {",
  "      try {",
  "        const regex = patternToRegExp(pattern);",
  "        return regex.test(url);",
  "      } catch (e) {}",
  "    }",
  "    try {",
  "      const reString = pattern.replace(/[?.+^${}()|[\\\\\\]]/g, '\\\\$&').replace(/\\*/g, '.*');",
  "      const regex = new RegExp('^' + reString + '$');",
  "      return regex.test(url);",
  "    } catch (e) { return false; }",
  "  };",
  "})();"
].join("\n");

async function buildScriptPayload(script: UserScript): Promise<{js: {code: string}[], world: "MAIN" | "USER_SCRIPT"}> {
    const isGrantNone = script.metadata.grants.length === 0 || 
                      (script.metadata.grants.length === 1 && script.metadata.grants[0] === "none");
    
    const world = (isGrantNone || script.preferredWorld === "MAIN") ? "MAIN" : "USER_SCRIPT";

    const manifest = chrome.runtime.getManifest();
    const versionInjection = `const GM_EXTENSION_VERSION = "${manifest.version}";\n`;
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
    const apiCode = versionInjection + idInjection + infoInjection + dataInjection + GM_API_CODE;

    const jsToInject: {code: string}[] = [];
    jsToInject.push({ code: apiCode });
    
    // Add @require libraries
    script.metadata.requires.forEach((url: string) => {
        const content = script.dependencyCache?.[url];
        if (content) {
            jsToInject.push({ code: content });
        }
    });
    
    let finalCode = script.code;
    const needsPreCheck = script.metadata.includes.length > 0 || script.metadata.excludes.length > 0;
    
    if (needsPreCheck) {
        jsToInject.unshift({ code: MATCHER_CODE }); // Inject matcher logic first
        const allIncludes = JSON.stringify(script.metadata.includes);
        const allExcludes = JSON.stringify(script.metadata.excludes);
        const wrapperStart = `
(function() {
const currentUrl = window.location.href;
const includes = ${allIncludes};
const excludes = ${allExcludes};
const isIncluded = includes.length === 0 || includes.some(p => ANMON_matchPattern(p, currentUrl));
const isExcluded = excludes.some(p => ANMON_matchPattern(p, currentUrl));
if (isExcluded || !isIncluded) {
  return;
}
`;
        finalCode = wrapperStart + script.code + "\n})();";
    }

    jsToInject.push({ code: finalCode });

    return { js: jsToInject, world };
}

export async function syncScripts() {
  console.log("Syncing scripts to browser...")
  try {
    if (!chrome.userScripts) {
      console.error(
        "chrome.userScripts API is not available. Make sure you are on Chrome 120+ and have the permission."
      )
      return
    }

    const dbScripts = await db.scripts.where("enabled").equals(1 as any).toArray()
    const registeredScripts = await chrome.userScripts.getScripts()

    const dbScriptIds = new Set(dbScripts.map((s) => s.id))
    const registeredScriptIds = new Set(registeredScripts.map((s) => s.id))

    const scriptsToAdd = dbScripts.filter((s) => !registeredScriptIds.has(s.id))
    const scriptsToUpdate = dbScripts.filter((s) => registeredScriptIds.has(s.id))
    const scriptIdsToRemove = [...registeredScriptIds].filter(
      (id) => !dbScriptIds.has(id)
    )
    
    const buildRegistration = async (script: UserScript): Promise<chrome.userScripts.RegisteredUserScriptOptions> => {
      const { js, world } = await buildScriptPayload(script);
      
      // For chrome.userScripts, @include and regex @exclude must be handled by the pre-check wrapper.
      // We pass non-regex patterns to the API for optimization.
      const includesAsMatches = script.metadata.includes.filter(i => !i.startsWith("/") || !i.endsWith("/"));
      let matches = [...script.metadata.matches, ...includesAsMatches];

      // If any regex @include exists, the script must run everywhere for the pre-check to work.
      if (script.metadata.includes.some(i => i.startsWith("/") && i.endsWith("/"))) {
          matches = ["<all_urls>"];
      }
      if (matches.length === 0) {
        matches = ["<all_urls>"]; // Default to all urls if no matches/includes provided for pre-check
      }

      const registration: chrome.userScripts.RegisteredUserScriptOptions = {
        id: script.id,
        matches,
        excludeMatches: script.metadata.excludes.filter(e => !e.startsWith("/") || !e.endsWith("/")),
        js,
        runAt: script.metadata.runAt,
      };

      if (world === "MAIN") {
          registration.world = "MAIN";
      } else {
          registration.world = "ISOLATED";
      }
      return registration;
    }

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
    
    for (const script of dbScripts) {
        await injectIntoExistingTabs(script);
    }
    
    console.log(`Sync complete. Added: ${scriptsToAdd.length}, Updated: ${scriptsToUpdate.length}, Removed: ${scriptIdsToRemove.length}.`)
  } catch (error) {
    console.error("Failed to sync scripts:", error)
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult[]> {
    console.log("Checking for script updates...");
    const scripts = await db.scripts.toArray();
    const results: UpdateCheckResult[] = [];
    
    for (const script of scripts) {
        const result = await checkScriptUpdate(script);
        if (result) {
            results.push(result);
        }
    }
    
    const lastUpdate = Date.now();
    await chrome.storage.local.set({ lastUpdateCheck: lastUpdate });
    return results;
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
        url: ["http://*/*", "https://*/*", "file://*/*"]
    });
    
    // Immediate injection must also respect @include/@exclude rules.
    // The pre-check wrapper inside the payload will handle this, but we still need to match here.
    const patternsToMatch = [...script.metadata.matches, ...script.metadata.includes];
    const patternsToExclude = script.metadata.excludes;

    for (const tab of allTabs) {
        if (!tab.id || !tab.url) continue;
        
        const shouldRunOnTab = (patternsToMatch.length === 0 || matchesUrl(patternsToMatch, tab.url)) && !matchesUrl(patternsToExclude, tab.url);

        if (!shouldRunOnTab) continue;
        
        try {
            const { js, world } = await buildScriptPayload(script);
            const fullCode = js.map(j => j.code).join("\n");
            
            // `executeScript` runs in ISOLATED world by default, which is fine for most USER_SCRIPT cases.
            // If MAIN world is needed, we must specify it.
            const injectionWorld = world === "MAIN" ? "MAIN" : "ISOLATED";

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (code: any) => {
                    try {
                        eval(code as string);

                    } catch (e) {
                        console.error("Error executing script in target world:", e);
                    }
                },
                args: [fullCode],
                world: injectionWorld,
            });
        } catch (e: any) {
            if (!e.message.includes("Cannot access") && !e.message.includes("Missing host permission") && !e.message.includes("No tab with id")) {
                 console.error(`Failed to inject script "${script.metadata.name}" into tab ${tab.id}:`, e);
            }
        }
    }
}
export async function bulkEnable(ids: string[]) {
    let success = 0;
    let failed = 0;
    for (const id of ids) {
        try {
            await db.scripts.update(id, { enabled: true });
            success++;
        } catch (e) {
            failed++;
        }
    }
    await syncScripts();
    return { success, failed };
}

export async function bulkDisable(ids: string[]) {
    let success = 0;
    let failed = 0;
    for (const id of ids) {
        try {
            await db.scripts.update(id, { enabled: false });
            success++;
        } catch (e) {
            failed++;
        }
    }
    await syncScripts();
    return { success, failed };
}

export async function bulkDelete(ids: string[]) {
    let success = 0;
    let failed = 0;
    for (const id of ids) {
        try {
            await db.scripts.delete(id);
            success++;
        } catch (e) {
            failed++;
        }
    }
    await syncScripts();
    return { success, failed };
}

export async function getLastUpdateCheck(): Promise<number | null> {
    const result = await chrome.storage.local.get("lastUpdateCheck");
    return (result.lastUpdateCheck as number) || null;
}

export async function checkScriptUpdate(script: UserScript): Promise<UpdateCheckResult | null> {
    const updateUrl = script.metadata.updateURL || script.metadata.downloadURL;
    if (!updateUrl) return null;

    try {
        const response = await fetch(updateUrl);
        if (!response.ok) return null;

        const code = await response.text();
        const { parseMetadata } = await import("./parser");
        const newMetadata = parseMetadata(code);

        if (isNewerVersion(newMetadata.version, script.metadata.version)) {
            return {
                scriptId: script.id,
                scriptName: script.metadata.name,
                currentVersion: script.metadata.version,
                newVersion: newMetadata.version,
                newCode: code,
                newMetadata
            };
        }
    } catch (e) {
        console.error(`Update check failed for ${script.metadata.name}:`, e);
    }
    return null;
}

export async function updateScript(scriptId: string, code: string, metadata: ScriptMetadata) {
    const script = await db.scripts.get(scriptId);
    if (!script) return;

    const dependencies: Record<string, string> = { ...script.dependencyCache };
    const toFetch = [
        ...metadata.requires.map(url => ({ url, type: 'require' })),
        ...metadata.resources.map(res => ({ url: res.url, type: 'resource' }))
    ];

    await Promise.all(toFetch.map(async (item) => {
        if (dependencies[item.url]) return;
        try {
            const res = await fetch(item.url);
            if (res.ok) dependencies[item.url] = await res.text();
        } catch (e) {
            console.error(`Failed to fetch dependency ${item.url}:`, e);
        }
    }));

    await db.scripts.update(scriptId, {
        code,
        metadata,
        lastModified: Date.now(),
        dependencyCache: dependencies
    });
    
    await syncScripts();
}
