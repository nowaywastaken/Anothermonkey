import React, { useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "~lib/db"
import { matchesUrl } from "~lib/matcher"
import "~style.css"
import { Power, Settings, FileCode, Command } from "lucide-react"
import clsx from "clsx"

interface MenuCommand {
    id: string;
    caption: string;
    scriptId: string;
    tabId: number;
}

const PopupIndex = () => {
  const [currentUrl, setCurrentUrl] = useState<string>("")
  const [currentTabId, setCurrentTabId] = useState<number | null>(null)
  const [menuCommands, setMenuCommands] = useState<MenuCommand[]>([])
  const allScripts = useLiveQuery(() => db.scripts.toArray(), []) || []
  
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (tab?.url && tab?.id) {
        setCurrentUrl(tab.url)
        setCurrentTabId(tab.id)
        
        // Fetch menu commands
        chrome.runtime.sendMessage({ action: "get_menu_commands", tabId: tab.id }, (response) => {
            if (response && response.commands) {
                setMenuCommands(response.commands)
            }
        })
      }
    })
  }, [])

  const activeScripts = allScripts.filter(s => s.enabled && matchesUrl(s.metadata.matches, currentUrl))
  const otherScripts = allScripts.filter(s => !activeScripts.find(as => as.id === s.id))

  const toggleScript = async (id: string, enabled: boolean) => {
      await db.scripts.update(id, { enabled })
      chrome.runtime.sendMessage({ action: "sync_scripts" })
  }

  const executeCommand = (cmd: MenuCommand) => {
      if (currentTabId) {
          chrome.runtime.sendMessage({ 
              action: "execute_menu_command", 
              targetTabId: currentTabId, 
              commandId: cmd.id 
          })
          window.close() // Close popup after action
      }
  }

  const openDashboard = () => {
      chrome.runtime.openOptionsPage()
  }

  return (
    <div className="w-80 bg-zinc-900 text-zinc-100 font-sans p-4">
      <div className="flex justify-between items-center mb-4 border-b border-zinc-700 pb-2">
        <h1 className="font-bold text-emerald-500 flex items-center gap-2">
            <FileCode size={20}/>
            AnotherMonkey
        </h1>
        <button onClick={openDashboard} className="text-zinc-400 hover:text-white transition-colors">
            <Settings size={18} />
        </button>
      </div>

      <div className="space-y-4">
          {menuCommands.length > 0 && (
              <div>
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Script Commands</h2>
                  <div className="space-y-1">
                      {menuCommands.map(cmd => (
                          <button 
                            key={cmd.id}
                            onClick={() => executeCommand(cmd)}
                            className="w-full text-left flex items-center gap-2 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-200 transition-colors"
                          >
                              <Command size={14} className="text-emerald-500"/>
                              {cmd.caption}
                          </button>
                      ))}
                  </div>
              </div>
          )}

          <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Active on this page</h2>
              {activeScripts.length > 0 ? (
                  <div className="space-y-2">
                      {activeScripts.map(script => (
                          <div key={script.id} className="flex justify-between items-center bg-zinc-800 p-2 rounded">
                              <span className="text-sm truncate max-w-[180px]">{script.metadata.name}</span>
                              <button onClick={() => toggleScript(script.id, false)} className="text-emerald-500 hover:text-emerald-400">
                                  <Power size={16} />
                              </button>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="text-sm text-zinc-600 italic">No active scripts</div>
              )}
          </div>

          {otherScripts.length > 0 && (
             <div>
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Other Scripts</h2>
                <div className="max-h-40 overflow-y-auto space-y-2">
                    {otherScripts.map(script => (
                        <div key={script.id} className="flex justify-between items-center bg-zinc-800/50 p-2 rounded">
                            <span className={clsx("text-sm truncate max-w-[180px]", !script.enabled && "text-zinc-500 line-through")}>
                                {script.metadata.name}
                            </span>
                             <button 
                                onClick={() => toggleScript(script.id, !script.enabled)} 
                                className={clsx("hover:text-white", script.enabled ? "text-emerald-500" : "text-zinc-600")}
                            >
                                <Power size={16} />
                            </button>
                        </div>
                    ))}
                </div>
             </div>
          )}
      </div>
    </div>
  )
}

export default PopupIndex
