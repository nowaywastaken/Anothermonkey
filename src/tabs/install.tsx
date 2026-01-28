import React, { useEffect, useState } from "react"
import { type ScriptMetadata, type UserScript } from "~lib/types"
import { parseMetadata } from "~lib/parser"
import { db } from "~lib/db"
import { Check, ShieldAlert, Code, Info, History, User, Link } from "lucide-react"

import "~style.css"

const InstallTab = () => {
  const [code, setCode] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<ScriptMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    chrome.runtime.sendMessage({ action: "get_pending_script" }, (response) => {
      if (response && response.code) {
        setCode(response.code)
        try {
          const meta = parseMetadata(response.code)
          setMetadata(meta)
        } catch (e) {
          setError(e.message)
        }
      } else {
        setError("No script content found. Please try again.")
      }
    })
  }, [])

  const handleInstall = async () => {
    if (!code || !metadata || isInstalling) return;

    setIsInstalling(true);
    try {
        const id = crypto.randomUUID();
        
        // Fetch dependencies
        const dependencyCache: Record<string, string> = {};
        const toFetch: string[] = [];
        metadata.requires.forEach(url => toFetch.push(url));
        metadata.resources.forEach(res => toFetch.push(res.url));
        
        await Promise.all(toFetch.map(async (url) => {
            try {
                const res = await fetch(url);
                if (res.ok) dependencyCache[url] = await res.text();
            } catch (e) {
                console.error(`Failed to fetch dependency ${url}:`, e);
            }
        }));

        const newScript: UserScript = {
            id,
            code,
            metadata,
            enabled: true,
            lastModified: Date.now(),
            dependencyCache
        };

        await db.scripts.add(newScript);
        await chrome.runtime.sendMessage({ action: "sync_scripts" });
        
        // Give a moment for the user to see the confirmation
        setTimeout(() => {
            window.close();
        }, 500);

    } catch (e) {
        setError("Failed to install script: " + e.message);
        setIsInstalling(false);
    }
  };

  const handleCancel = () => {
    window.close();
  };

  const renderContent = () => {
    if (error) {
      return <div className="text-red-400 text-center">{error}</div>
    }

    if (!metadata) {
      return <div className="text-center">Loading script details...</div>
    }

    const hasUnsafeGrants = metadata.grants.some(g => g.startsWith("GM_") || g.startsWith("GM."));

    return (
      <div className="bg-zinc-800 rounded-lg shadow-2xl p-8 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-emerald-400 mb-2">{metadata.name}</h1>
        <div className="flex items-center gap-4 text-zinc-400 text-sm mb-6 border-b border-zinc-700 pb-4">
            <span className="flex items-center gap-1"><User size={14}/> {metadata.author || 'No author'}</span>
            <span className="flex items-center gap-1"><History size={14}/> v{metadata.version}</span>
        </div>
        
        <p className="flex items-start gap-2 text-zinc-300 mb-6"><Info size={16} className="mt-1 shrink-0"/> {metadata.description || 'No description provided.'}</p>

        <div className="mb-6">
            <h3 className="font-semibold text-lg text-zinc-200 mb-3 flex items-center gap-2"><Code size={18}/> Runs on:</h3>
            <div className="flex flex-wrap gap-2">
                {metadata.matches.map(m => <span key={m} className="bg-zinc-700 text-zinc-200 text-xs px-2 py-1 rounded">{m}</span>)}
                 {metadata.includes.map(m => <span key={m} className="bg-zinc-700 text-zinc-200 text-xs px-2 py-1 rounded">{m}</span>)}
            </div>
        </div>

        <div className={`p-4 rounded-lg mb-8 ${hasUnsafeGrants ? 'bg-amber-900/50 border border-amber-700' : 'bg-green-900/50 border border-green-700'}`}>
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                {hasUnsafeGrants ? <ShieldAlert className="text-amber-400"/> : <Check className="text-green-400"/>}
                Permissions
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
                {hasUnsafeGrants 
                    ? "This script requests potentially sensitive permissions that can access data across websites." 
                    : "This script does not request any special permissions."
                }
            </p>
            <div className="flex flex-wrap gap-2">
                 {metadata.grants.length > 0 
                    ? metadata.grants.map(g => <span key={g} className="bg-zinc-700 text-zinc-200 font-mono text-xs px-2 py-1 rounded">{g}</span>)
                    : <span className="text-zinc-500 text-sm">None</span>
                }
            </div>
        </div>

        {metadata.connects.length > 0 && (
            <div className="p-4 rounded-lg mb-8 bg-sky-900/50 border border-sky-700">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2"><Link/> Network Access</h3>
                 <p className="text-sm text-zinc-400 mb-4">This script can make requests to the following domains:</p>
                 <div className="flex flex-wrap gap-2">
                    {metadata.connects.map(c => <span key={c} className="bg-zinc-700 text-zinc-200 font-mono text-xs px-2 py-1 rounded">{c}</span>)}
                </div>
            </div>
        )}

        <div className="flex justify-end gap-4 mt-8">
          <button onClick={handleCancel} className="px-6 py-2 rounded bg-zinc-700 hover:bg-zinc-600 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleInstall} 
            disabled={isInstalling}
            className="px-6 py-2 rounded bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:bg-emerald-800 disabled:cursor-wait flex items-center gap-2"
          >
            {isInstalling ? "Installing..." : "Install"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 font-sans p-4">
      {renderContent()}
    </div>
  )
}

export default InstallTab