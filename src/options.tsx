import React, { useState, useEffect, useRef, useCallback } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "~lib/db"
import { parseMetadata } from "~lib/parser"
import { ScriptList } from "~components/ScriptList"
import { ScriptEditor } from "~components/ScriptEditor"
import { type UserScript } from "~lib/types"
import { bulkEnable, bulkDisable, bulkDelete, checkForUpdates, getLastUpdateCheck, checkScriptUpdate, updateScript, type UpdateCheckResult } from "~lib/script-manager"
import { Moon, Sun } from "lucide-react"

import "~style.css"

const DEFAULT_SCRIPT = `// ==UserScript==
// @name         New Script
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.google.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log("Hello from AnotherMonkey!");
})();
`

const OptionsIndex = () => {
  const scripts = useLiveQuery(() => db.scripts.toArray(), []) || []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedScript, setSelectedScript] = useState<UserScript | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  
  // Update checking state
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [availableUpdates, setAvailableUpdates] = useState<UpdateCheckResult[]>([])
  const [lastUpdateCheck, setLastUpdateCheck] = useState<number | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

  // Dark mode state
  const [darkMode, setDarkMode] = useState<boolean | null>(null)
  const [isDarkModeInitialized, setIsDarkModeInitialized] = useState(false)

  // Load selected script content
  useEffect(() => {
    if (selectedId) {
      db.scripts.get(selectedId).then((script) => {
        if (script) {
          setSelectedScript(script)
          setIsDirty(false)
        }
      })
    } else {
      setSelectedScript(null)
    }
  }, [selectedId])

  // Load last update check time
  useEffect(() => {
    getLastUpdateCheck().then(setLastUpdateCheck)
  }, [])

  // Dark mode initialization and effect
  useEffect(() => {
    const initDarkMode = async () => {
      try {
        const result = await chrome.storage.local.get('darkMode') as { darkMode?: boolean }
        const storedDarkMode = result.darkMode
        
        if (storedDarkMode !== undefined) {
          // User has explicitly set a preference
          setDarkMode(storedDarkMode)
          if (storedDarkMode) {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }
        } else {
          // No user preference, use system preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          setDarkMode(prefersDark)
          if (prefersDark) {
            document.documentElement.classList.add('dark')
          }
        }
      } catch (error) {
        console.error('Failed to load dark mode preference:', error)
        // Fallback to system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        setDarkMode(prefersDark)
        if (prefersDark) {
          document.documentElement.classList.add('dark')
        }
      } finally {
        setIsDarkModeInitialized(true)
      }
    }
    
    initDarkMode()
  }, [])

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't explicitly set a preference
      chrome.storage.local.get('darkMode').then((result) => {
        if (result.darkMode === undefined) {
          setDarkMode(e.matches)
          if (e.matches) {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }
        }
      })
    }
    
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Handle dark mode toggle
  const toggleDarkMode = useCallback(async () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    
    if (newDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    
    try {
      await chrome.storage.local.set({ darkMode: newDarkMode })
    } catch (error) {
      console.error('Failed to save dark mode preference:', error)
    }
  }, [darkMode])

  const handleSelect = (id: string) => {
    if (isDirty) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to discard them and switch scripts?")) {
        return; // User cancelled the switch
      }
    }
    setSelectedId(id)
  }

  const handleCreate = async () => {
    const id = crypto.randomUUID()
    const metadata = parseMetadata(DEFAULT_SCRIPT)
    await db.scripts.add({
      id,
      code: DEFAULT_SCRIPT,
      enabled: true,
      lastModified: Date.now(),
      metadata
    })
    setSelectedId(id)
    triggerSync()
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)

    try {
      const code = await readFileAsText(file)
      const metadata = parseMetadata(code)

      // Check for duplicate scripts by name
      const existingScripts = await db.scripts.toArray()
      const duplicate = existingScripts.find(
        (s) => s.metadata.name === metadata.name && s.metadata.namespace === metadata.namespace
      )

      if (duplicate) {
        const overwrite = window.confirm(
          `A script with the name "${metadata.name}" already exists.\n\nDo you want to overwrite it?`
        )
        if (!overwrite) return

        // Update existing script
        await db.scripts.update(duplicate.id, {
          code,
          metadata,
          lastModified: Date.now()
        })
      } else {
        // Add new script
        const id = crypto.randomUUID()
        await db.scripts.add({
          id,
          code,
          enabled: true,
          lastModified: Date.now(),
          metadata
        })
      }

      triggerSync()
      alert(`Successfully imported "${metadata.name}"!`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      setImportError(errorMessage)
      alert(`Failed to import script: ${errorMessage}`)
    } finally {
      // Reset input
      event.target.value = ''
    }
  }

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsText(file)
    })
  }

  const handleSave = async (code: string) => {
    if (!selectedId || isSaving) return

    setIsSaving(true);
    try {
      const metadata = parseMetadata(code)

      // Fetch new dependencies if any
      const newDeps: Record<string, string> = { ...(selectedScript?.dependencyCache || {}) }
      const toFetch: string[] = []

      metadata.requires.forEach(url => {
        if (!newDeps[url]) toFetch.push(url)
      })
      metadata.resources.forEach(res => {
        if (!newDeps[res.url]) toFetch.push(res.url)
      })

      if (toFetch.length > 0) {
        await Promise.all(toFetch.map(async (url) => {
          try {
            const res = await fetch(url)
            if (res.ok) {
              newDeps[url] = await res.text()
            }
          } catch (e) {
            console.error("Failed to fetch dependency:", url, e)
          }
        }))
      }

      await db.scripts.update(selectedId, {
        code,
        metadata,
        lastModified: Date.now(),
        dependencyCache: newDeps
      })
      // Update local state to clear dirty flag
      setSelectedScript(prev => prev ? ({ ...prev, code, metadata, dependencyCache: newDeps }) : null)
      setIsDirty(false)
      triggerSync()
    } catch (e) {
      alert("Error parsing metadata: " + e)
    } finally {
      setIsSaving(false);
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await db.scripts.update(id, { enabled })
    triggerSync()
  }

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this script?")) {
      await db.scripts.delete(id)
      if (selectedId === id) setSelectedId(null)
      triggerSync()
    }
  }

  const handleBulkEnable = async (ids: string[]) => {
    const result = await bulkEnable(ids)
    if (result.failed > 0) {
      alert(`Failed to enable ${result.failed} script(s). Check console for details.`)
    }
    if (result.success > 0) {
      console.log(`Enabled ${result.success} script(s)`)
    }
  }

  const handleBulkDisable = async (ids: string[]) => {
    const result = await bulkDisable(ids)
    if (result.failed > 0) {
      alert(`Failed to disable ${result.failed} script(s). Check console for details.`)
    }
    if (result.success > 0) {
      console.log(`Disabled ${result.success} script(s)`)
    }
  }

  const handleBulkDelete = async (ids: string[]) => {
    const result = await bulkDelete(ids)
    if (result.failed > 0) {
      alert(`Failed to delete ${result.failed} script(s). Check console for details.`)
    }
    if (result.success > 0) {
      console.log(`Deleted ${result.success} script(s)`)
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null)
      }
    }
  }

  const triggerSync = () => {
    chrome.runtime.sendMessage({ action: "sync_scripts" })
  }

  const handleEditorChange = (newCode: string) => {
    if (selectedScript && newCode !== selectedScript.code) {
      setIsDirty(true)
    } else {
      setIsDirty(false)
    }
  }

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true)
    setUpdateError(null)
    try {
      const updates = await checkForUpdates()
      setAvailableUpdates(updates)
      setLastUpdateCheck(Date.now())
      if (updates.length === 0) {
        alert("All scripts are up to date!")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      setUpdateError(errorMessage)
      alert(`Failed to check for updates: ${errorMessage}`)
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  const handleUpdateScript = async (scriptId: string, scriptName: string) => {
    const script = await db.scripts.get(scriptId)
    if (!script) return
    
    try {
      const updateResult = await checkScriptUpdate(script)
      if (updateResult) {
        await updateScript(scriptId, updateResult.newCode, updateResult.newMetadata)
        // Remove from available updates
        setAvailableUpdates(prev => prev.filter(u => u.scriptId !== scriptId))
        alert(`Updated "${scriptName}" to version ${updateResult.newMetadata.version}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      alert(`Failed to update "${scriptName}": ${errorMessage}`)
    }
  }

  const formatLastCheckTime = () => {
    if (!lastUpdateCheck) return "Never"
    const date = new Date(lastUpdateCheck)
    return date.toLocaleString()
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".user.js,.js"
          onChange={handleFileImport}
          className="hidden"
        />
        <ScriptList
          scripts={scripts}
          selectedId={selectedId}
          onSelect={handleSelect}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onCreate={handleCreate}
          onImport={handleImportClick}
          onBulkEnable={handleBulkEnable}
          onBulkDisable={handleBulkDisable}
          onBulkDelete={handleBulkDelete}
          darkMode={darkMode}
        />
      </>
      <div className="flex-1 h-full flex flex-col">
        {/* Update Section */}
        <div className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Script Updates</h2>
              <button
                onClick={handleCheckUpdates}
                disabled={isCheckingUpdates}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-md transition-colors"
              >
                {isCheckingUpdates ? "Checking..." : "Check for updates"}
              </button>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Last check: {formatLastCheckTime()}
              </span>
            </div>
            
            {/* Dark Mode Toggle */}
            <div className="flex items-center gap-2">
              <Sun size={16} className="text-zinc-500 dark:text-zinc-400" />
              <button
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${darkMode ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
              <Moon size={16} className="text-zinc-500 dark:text-zinc-400" />
            </div>
          </div>
          
          {/* Available Updates List */}
          {availableUpdates.length > 0 && (
            <div className="mt-4 p-4 bg-zinc-200 dark:bg-zinc-800 rounded-lg">
              <h3 className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 mb-3">
                {availableUpdates.length} update(s) available
              </h3>
              <div className="space-y-2">
                {availableUpdates.map((update) => (
                  <div
                    key={update.scriptId}
                    className="flex items-center justify-between p-3 bg-zinc-100 dark:bg-zinc-700 rounded-md"
                  >
                    <div>
                      <span className="font-medium text-zinc-900 dark:text-zinc-200">{update.scriptName}</span>
                      <span className="text-zinc-500 dark:text-zinc-500 mx-2">→</span>
                      <span className="text-green-600 dark:text-green-400">
                        {update.currentVersion} → {update.newVersion}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUpdateScript(update.scriptId, update.scriptName)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md transition-colors"
                    >
                      Update
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {updateError && (
            <div className="mt-2 text-red-500 dark:text-red-400 text-sm">
              Error: {updateError}
            </div>
          )}
        </div>
        
        <div className="flex-1 h-full overflow-hidden">
          {selectedScript ? (
            <ScriptEditor
              key={selectedScript.id} // Re-mount on ID change to reset editor state if needed
              initialCode={selectedScript.code}
              onSave={handleSave}
              onChange={handleEditorChange}
              isDirty={isDirty}
              isSaving={isSaving}
              darkMode={darkMode}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 dark:text-zinc-500">
              Select a script to edit
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OptionsIndex
