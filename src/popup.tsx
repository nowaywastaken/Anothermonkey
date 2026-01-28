import React, { useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "~lib/db"
import { Power, Settings, ExternalLink, Menu as MenuIcon } from "lucide-react"
import clsx from "clsx"

import "~style.css"

const PopupIndex = () => {
  const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null)
  const [runningScripts, setRunningScripts] = useState<any[]>([])
  const [menuCommands, setMenuCommands] = useState<any[]>([])
  
  const scripts = useLiveQuery(() => db.scripts.toArray(), []) || []

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        setActiveTab(tabs[0])
        const tabId = tabs[0].id
        if (tabId) {
            // Fetch running scripts (based on matches)
            // In a real scenario, the content script might report back which ones are actually running.
            // For now, we'll estimate based on match patterns.
            const url = tabs[0].url || ""
            
            // This is a naive check. A better way is to have the script report execution.
            // But let's use the DB for now.
            
            // Fetch menu commands from background
            chrome.runtime.sendMessage({ action: "get_menu_commands", tabId }, (response) => {
                if (response && response.commands) {
                    setMenuCommands(response.commands)
                }
            })
        }
      }
    })
  }, [])

  const openDashboard = () => {
    chrome.runtime.openOptionsPage()
    window.close()
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await db.scripts.update(id, { enabled })
    chrome.runtime.sendMessage({ action: "sync_scripts" })
  }

  const executeCommand = (commandId: string, scriptId: string) => {
      if (activeTab?.id) {
          chrome.runtime.sendMessage({ 
              action: "execute_menu_command", 
              targetTabId: activeTab.id, 
              commandId 
          })
          window.close()
      }
  }

  return (
    <div className="w-80 bg-zinc-950 text-zinc-100 font-sans shadow-2xl">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center text-zinc-950 font-bold text-xs">A</div>
            <span className="font-bold text-emerald-500">AnotherMonkey</span>
        </div>
        <div className="flex gap-2">
            <button onClick={openDashboard} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors">
                <Settings size={16} />
            </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {/* Menu Commands Section */}
        {menuCommands.length > 0 && (
            <div className="p-2 border-b border-zinc-800">
                <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Commands</div>
                <div className="space-y-1 mt-1">
                    {menuCommands.map(cmd => (
                        <button 
                            key={cmd.id}
                            onClick={() => executeCommand(cmd.id, cmd.scriptId)}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-emerald-500/10 hover:text-emerald-400 rounded text-sm text-zinc-300 transition-colors text-left"
                        >
                            <MenuIcon size={14} className="shrink-0 text-emerald-600" />
                            <span className="truncate">{cmd.caption}</span>
                        </button>
                    ))}
                </div>
            </div>
        )}

        {/* Running Scripts Section (Estimated) */}
        <div className="p-2">
            <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Scripts for this site</div>
            <div className="space-y-1 mt-1">
                {scripts.filter(s => {
                    // Very basic match check
                    if (!activeTab?.url) return false;
                    return s.metadata.matches.some(m => m === "<all_urls>" || activeTab.url?.includes(m.replace("*", "")))
                }).map(script => (
                    <div key={script.id} className="flex items-center justify-between px-3 py-2 hover:bg-zinc-900 rounded group">
                        <div className="flex flex-col overflow-hidden">
                            <span className={clsx("text-sm truncate", script.enabled ? "text-zinc-200" : "text-zinc-600")}>
                                {script.metadata.name}
                            </span>
                            <span className="text-[10px] text-zinc-500">{script.metadata.version}</span>
                        </div>
                        <button 
                            onClick={() => handleToggle(script.id, !script.enabled)}
                            className={clsx(
                                "p-1.5 rounded transition-colors",
                                script.enabled ? "text-emerald-500 bg-emerald-500/10" : "text-zinc-700 bg-zinc-800"
                            )}
                        >
                            <Power size={14} />
                        </button>
                    </div>
                ))}
                {scripts.length === 0 && (
                    <div className="p-4 text-center text-zinc-600 text-xs italic">
                        No scripts installed
                    </div>
                )}
            </div>
        </div>
      </div>

      <div className="p-3 bg-zinc-900/30 border-t border-zinc-800 text-center">
        <button 
            onClick={openDashboard}
            className="text-xs text-zinc-500 hover:text-emerald-500 transition-colors flex items-center justify-center gap-1 w-full"
        >
            Manage all scripts <ExternalLink size={10} />
        </button>
      </div>
    </div>
  )
}

export default PopupIndex