import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"
import { parseMetadata } from "../lib/parser"
import { db } from "../lib/db"
import { Download, X } from "lucide-react"
import "../style.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

const InstallUI = () => {
  const [scriptCode, setScriptCode] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<any>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (window.location.pathname.endsWith(".user.js")) {
        // Attempt to read content. 
        // Chrome displays text files in a <pre> usually within a generic html structure.
        const content = document.body.innerText
        try {
            const meta = parseMetadata(content)
            setScriptCode(content)
            setMetadata(meta)
            setIsVisible(true)
        } catch (e) {
            // Not a valid userscript or just a coincidence
            console.log("Not a valid userscript", e)
        }
    }
  }, [])

  const handleInstall = async () => {
    if (!scriptCode || !metadata) return
    
    // Check if exists
    const existing = await db.scripts.where("metadata.name").equals(metadata.name).first()
    
    if (existing) {
        if (!confirm(`Script "${metadata.name}" already exists. Overwrite?`)) return
        await db.scripts.update(existing.id, {
            code: scriptCode,
            metadata,
            lastModified: Date.now()
        })
    } else {
        await db.scripts.add({
            id: crypto.randomUUID(),
            enabled: true,
            code: scriptCode,
            metadata,
            lastModified: Date.now()
        })
    }

    // Sync
    chrome.runtime.sendMessage({ action: "sync_scripts" })
    
    setIsVisible(false)
    alert("Script installed successfully!")
  }

  if (!isVisible || !metadata) return null

  return (
    <div className="fixed top-5 right-5 z-[9999] w-96 bg-zinc-900 border border-zinc-700 shadow-2xl rounded-lg overflow-hidden font-sans text-zinc-100 animate-in slide-in-from-right">
      <div className="bg-zinc-800 p-4 border-b border-zinc-700 flex justify-between items-center">
        <h3 className="font-bold text-emerald-500 flex items-center gap-2">
            <Download size={20}/>
            Install Userscript
        </h3>
        <button onClick={() => setIsVisible(false)} className="text-zinc-500 hover:text-white">
            <X size={20} />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div>
            <div className="text-sm text-zinc-500">Name</div>
            <div className="font-medium text-lg">{metadata.name}</div>
        </div>
        <div>
            <div className="text-sm text-zinc-500">Version</div>
            <div>{metadata.version}</div>
        </div>
        <div>
            <div className="text-sm text-zinc-500">Description</div>
            <div className="text-sm text-zinc-300 line-clamp-2">{metadata.description || "No description"}</div>
        </div>
        
        {metadata.grants.length > 0 && (
             <div>
                <div className="text-sm text-zinc-500">Permissions</div>
                <div className="flex flex-wrap gap-1 mt-1">
                    {metadata.grants.map((g: string) => (
                        <span key={g} className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 border border-zinc-700">
                            {g}
                        </span>
                    ))}
                </div>
            </div>
        )}

        <div className="pt-2 flex gap-2">
            <button 
                onClick={handleInstall}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded font-medium transition-colors"
            >
                Install
            </button>
             <button 
                onClick={() => setIsVisible(false)}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white py-2 rounded font-medium transition-colors"
            >
                Cancel
            </button>
        </div>
      </div>
    </div>
  )
}

export default InstallUI
