import React, { useEffect, useState } from "react"
import { parseMetadata } from "~lib/parser"
import { db } from "~lib/db"
import { Download, AlertTriangle, CheckCircle, Loader2, FileCode } from "lucide-react"
import "~style.css"
import type { ScriptMetadata } from "~lib/types"

const InstallPage = () => {
  const [code, setCode] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<ScriptMetadata | null>(null)
  const [dependencies, setDependencies] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    chrome.runtime.sendMessage({ action: "get_pending_script" }, async (response) => {
        if (response && response.code) {
            try {
                const meta = parseMetadata(response.code)
                setCode(response.code)
                setMetadata(meta)
                
                // Start fetching dependencies
                const deps: Record<string, string> = {}
                const toFetch = [
                    ...meta.requires.map(url => ({ url, type: 'require' })),
                    ...meta.resources.map(res => ({ url: res.url, type: 'resource' }))
                ]

                if (toFetch.length > 0) {
                    await Promise.all(toFetch.map(async (item) => {
                        try {
                            const res = await fetch(item.url)
                            if (!res.ok) throw new Error(`Failed to fetch ${item.url}`)
                            const text = await res.text()
                            deps[item.url] = text
                        } catch (e) {
                            console.error(e)
                            // We allow installation even if deps fail, but warn?
                            // For now, just mark empty or error string
                            deps[item.url] = `// Failed to load: ${e.message}`
                        }
                    }))
                }
                setDependencies(deps)
                setLoading(false)

            } catch (e) {
                setError("Failed to parse script: " + e.message)
                setLoading(false)
            }
        } else {
            setError("No script found to install.")
            setLoading(false)
        }
    })
  }, [])

  const handleInstall = async () => {
      if (!code || !metadata) return
      setInstalling(true)
      
      try {
        const existing = await db.scripts.where("metadata.name").equals(metadata.name).first()
        
        const scriptData = {
            enabled: true,
            code: code,
            metadata,
            lastModified: Date.now(),
            dependencyCache: dependencies
        }

        if (existing) {
            await db.scripts.update(existing.id, scriptData)
        } else {
            await db.scripts.add({
                id: crypto.randomUUID(),
                ...scriptData
            })
        }

        // Sync
        await chrome.runtime.sendMessage({ action: "sync_scripts" })
        
        // Close tab
        window.close()
      } catch (e) {
          setError("Installation failed: " + e.message)
          setInstalling(false)
      }
  }

  if (loading) {
      return (
          <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
              <Loader2 className="animate-spin mr-2" /> Loading script...
          </div>
      )
  }

  if (error) {
      return (
        <div className="flex items-center justify-center h-screen bg-zinc-950 text-red-400">
            <AlertTriangle className="mr-2" /> {error}
        </div>
      )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-8 flex justify-center">
        <div className="max-w-3xl w-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex items-center gap-4">
                <div className="bg-emerald-500/10 p-3 rounded-full text-emerald-500">
                    <Download size={32} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Install Userscript</h1>
                    <p className="text-zinc-400">from {metadata?.namespace || "unknown source"}</p>
                </div>
            </div>
            
            <div className="p-6 space-y-6">
                <div>
                    <h2 className="text-lg font-semibold mb-2 text-zinc-200">{metadata?.name}</h2>
                    <div className="text-sm text-zinc-400">{metadata?.description}</div>
                    <div className="mt-2 flex gap-4 text-sm text-zinc-500">
                        <span>Version: {metadata?.version}</span>
                        <span>Author: {metadata?.author || "?"}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-2">Runs on</h3>
                        <div className="bg-zinc-950/50 rounded p-3 max-h-40 overflow-y-auto space-y-1">
                            {metadata?.matches.map(m => (
                                <div key={m} className="font-mono text-xs text-emerald-400">{m}</div>
                            ))}
                            {metadata?.includes.map(m => (
                                <div key={m} className="font-mono text-xs text-blue-400">{m} (include)</div>
                            ))}
                        </div>
                    </div>
                    <div>
                         <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-2">Permissions</h3>
                         <div className="flex flex-wrap gap-2">
                             {metadata?.grants.length ? metadata.grants.map(g => (
                                 <span key={g} className="text-xs bg-zinc-800 border border-zinc-700 px-2 py-1 rounded text-zinc-300">
                                     {g}
                                 </span>
                             )) : <span className="text-xs text-zinc-500 italic">None</span>}
                         </div>
                    </div>
                </div>

                {(metadata?.requires.length > 0 || metadata?.resources.length > 0) && (
                     <div>
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-2">Dependencies</h3>
                         <div className="bg-zinc-950/50 rounded p-3 space-y-2">
                             {metadata?.requires.map(req => (
                                 <div key={req} className="flex items-center gap-2 text-xs">
                                     {dependencies[req] && !dependencies[req].startsWith("// Failed") 
                                        ? <CheckCircle size={12} className="text-emerald-500"/>
                                        : <AlertTriangle size={12} className="text-amber-500"/>
                                     }
                                     <span className="truncate flex-1">{req}</span>
                                     <span className="text-zinc-600 text-[10px] uppercase border border-zinc-700 px-1 rounded">Script</span>
                                 </div>
                             ))}
                             {metadata?.resources.map(res => (
                                 <div key={res.name} className="flex items-center gap-2 text-xs">
                                      {dependencies[res.url] && !dependencies[res.url].startsWith("// Failed")
                                        ? <CheckCircle size={12} className="text-emerald-500"/>
                                        : <AlertTriangle size={12} className="text-amber-500"/>
                                     }
                                     <span className="font-bold text-zinc-400">{res.name}</span>
                                     <span className="truncate flex-1 text-zinc-500">{res.url}</span>
                                     <span className="text-zinc-600 text-[10px] uppercase border border-zinc-700 px-1 rounded">Resource</span>
                                 </div>
                             ))}
                         </div>
                     </div>
                )}
            </div>

            <div className="bg-zinc-800 p-6 border-t border-zinc-800 flex justify-end gap-3">
                <button 
                    onClick={() => window.close()}
                    className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleInstall}
                    disabled={installing}
                    className="px-6 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    {installing && <Loader2 size={16} className="animate-spin" />}
                    {installing ? "Installing..." : "Install Script"}
                </button>
            </div>
        </div>
    </div>
  )
}

export default InstallPage
