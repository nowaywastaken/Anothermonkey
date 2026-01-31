import React, { useState, useEffect, useRef, useCallback } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "~lib/db"
import { parseMetadata } from "~lib/parser"
import { fetchScriptDependencies, fromLegacyCacheFormat, toLegacyCacheFormat, DEFAULT_DEPENDENCY_TTL, type CachedDependency } from "~lib/dependency-cache"
import { ScriptList } from "~components/ScriptList"
import { ScriptEditor } from "~components/ScriptEditor"
import { ToastProvider, useToast } from "~components/Toast"
import { type UserScript } from "~lib/types"
import { bulkEnable, bulkDisable, bulkDelete, checkForUpdates, getLastUpdateCheck, checkScriptUpdate, updateScript, type UpdateCheckResult } from "~lib/script-manager"
import { Moon, Sun, Cloud, CloudDownload, CloudUpload, RefreshCw, BarChart3, Clock, Settings } from "lucide-react"
import { getAuthToken, findBackupFile, uploadBackup, downloadBackup, restoreFromBackup, getAutoSyncEnabled, getSyncIntervalMinutes, getLastSyncTimestamp, configureAutoSync, SYNC_FREQUENCY_OPTIONS } from "~lib/cloud-sync"
import { logger } from "~lib/logger"

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

    // Your code here!
})();
`

const OptionsIndexInner = () => {
  const { addToast } = useToast()
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

  // Cloud Sync state
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // Auto-sync configuration state
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(1440)
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(null)
  const [isLoadingSyncSettings, setIsLoadingSyncSettings] = useState(true)

  // Dark mode state
  const [darkMode, setDarkMode] = useState<boolean | null>(null)
  const [isDarkModeInitialized, setIsDarkModeInitialized] = useState(false)

  // Active tab state (scripts, stats)
  const [activeTab, setActiveTab] = useState<'scripts' | 'stats'>('scripts')

  // Stats state
  const [stats, setStats] = useState<Array<{ scriptId: string; runCount: number; lastRun: number; totalErrors: number }>>([])
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [scriptIdToNameMap, setScriptIdToNameMap] = useState<Record<string, string>>({})

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

  // Load auto-sync settings
  useEffect(() => {
    const loadSyncSettings = async () => {
      try {
        const [enabled, interval, lastSync] = await Promise.all([
          getAutoSyncEnabled(),
          getSyncIntervalMinutes(),
          getLastSyncTimestamp()
        ]);
        setAutoSyncEnabled(enabled);
        setSyncIntervalMinutes(interval);
        setLastSyncTimestamp(lastSync);
      } catch (error) {
        console.error("Failed to load sync settings:", error);
      } finally {
        setIsLoadingSyncSettings(false);
      }
    };
    loadSyncSettings();
  }, []);

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
        logger.error('Failed to load dark mode preference:', error)
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
      logger.error('Failed to save dark mode preference:', error)
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

      // Auto-fetch dependencies if any
      const dependencyCache = await fetchScriptDependencies(
        metadata.requires,
        metadata.resources,
        duplicate?.dependencyCache ? fromLegacyCacheFormat(duplicate.dependencyCache) : {},
        DEFAULT_DEPENDENCY_TTL
      )
      const legacyCacheFormat = toLegacyCacheFormat(dependencyCache)

      if (duplicate) {
        const overwrite = window.confirm(
          `A script with the name "${metadata.name}" already exists.\n\nDo you want to overwrite it?`
        )
        if (!overwrite) return

        // Update existing script
        await db.scripts.update(duplicate.id, {
          code,
          metadata,
          lastModified: Date.now(),
          dependencyCache: legacyCacheFormat
        })
      } else {
        // Add new script
        const id = crypto.randomUUID()
        await db.scripts.add({
          id,
          code,
          enabled: true,
          lastModified: Date.now(),
          metadata,
          dependencyCache: legacyCacheFormat
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

      // Get existing cache and convert to new format for processing
      const existingCache = selectedScript?.dependencyCache 
        ? fromLegacyCacheFormat(selectedScript.dependencyCache)
        : {};

      // Fetch new dependencies if any
      const newCache = await fetchScriptDependencies(
        metadata.requires,
        metadata.resources,
        existingCache,
        DEFAULT_DEPENDENCY_TTL
      );
      const legacyCacheFormat = toLegacyCacheFormat(newCache);

      await db.scripts.update(selectedId, {
        code,
        metadata,
        lastModified: Date.now(),
        dependencyCache: legacyCacheFormat
      })
      // Update local state to clear dirty flag
      setSelectedScript(prev => prev ? ({ ...prev, code, metadata, dependencyCache: legacyCacheFormat }) : null)
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
    await chrome.runtime.sendMessage({ action: "sync_scripts" })
    // If enabling a script, inject it immediately into matching open tabs
    if (enabled) {
      await chrome.runtime.sendMessage({ action: "inject_existing_tabs", scriptId: id })
    }
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
      logger.debug(`Enabled ${result.success} script(s)`)
    }
  }

  const handleBulkDisable = async (ids: string[]) => {
    const result = await bulkDisable(ids)
    if (result.failed > 0) {
      alert(`Failed to disable ${result.failed} script(s). Check console for details.`)
    }
    if (result.success > 0) {
      logger.debug(`Disabled ${result.success} script(s)`)
    }
  }

  const handleBulkDelete = async (ids: string[]) => {
    const result = await bulkDelete(ids)
    if (result.failed > 0) {
      alert(`Failed to delete ${result.failed} script(s). Check console for details.`)
    }
    if (result.success > 0) {
      logger.debug(`Deleted ${result.success} script(s)`)
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null)
      }
    }
  }

  // Export single script
  const handleExport = async (id: string) => {
    const script = await db.scripts.get(id)
    if (!script) return
    
    const blob = new Blob([script.code], { type: "application/javascript" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${script.metadata.name || "script"}.user.js`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Bulk export scripts
  const handleBulkExport = async (ids: string[]) => {
    const scriptsToExport = await db.scripts.bulkGet(ids)
    const validScripts = scriptsToExport.filter((s): s is UserScript => s !== undefined)
    
    if (validScripts.length === 0) {
      addToast({ type: 'warning', title: 'No scripts selected', message: 'Please select scripts to export' })
      return
    }
    
    if (validScripts.length === 1) {
      // Single script, download directly
      await handleExport(validScripts[0].id)
      addToast({ type: 'success', title: 'Script exported', message: `${validScripts[0].metadata.name} has been exported` })
      return
    }
    
    // Multiple scripts - show progress and download each one
    addToast({ type: 'info', title: 'Exporting scripts', message: `Exporting ${validScripts.length} script(s)...`, duration: 10000 })
    
    let exportedCount = 0
    for (const script of validScripts) {
      const blob = new Blob([script.code], { type: "application/javascript" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${script.metadata.name || script.id}.user.js`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      exportedCount++
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 100))
    }
    
    addToast({ type: 'success', title: 'Export complete', message: `Successfully exported ${exportedCount} script(s)` })
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

  // Fetch stats when stats tab is active
  useEffect(() => {
    if (activeTab === 'stats') {
      setIsLoadingStats(true)
      // Build script ID to name map
      const idToName: Record<string, string> = {}
      scripts.forEach(s => {
        idToName[s.id] = s.metadata.name || 'Unnamed Script'
      })
      setScriptIdToNameMap(idToName)
      
      chrome.runtime.sendMessage({ action: 'get_all_stats' }, (response) => {
        setIsLoadingStats(false)
        if (response && response.success) {
          setStats(response.stats || [])
        }
      })
    }
  }, [activeTab, scripts])

  const formatLastRun = (timestamp: number): string => {
    if (!timestamp) return 'Never'
    
    const now = Date.now()
    const diff = now - timestamp
    
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    return 'Just now'
  }

  const handleCloudBackup = async () => {
    setIsSyncing(true)
    setSyncStatus("Authenticating...")
    try {
      const token = await getAuthToken(true)
      setSyncStatus("Finding backup file...")
      const fileId = await findBackupFile(token)
      setSyncStatus("Uploading data...")
      await uploadBackup(token, fileId)
      alert("Successfully backed up to Google Drive!")
    } catch (error: any) {
      alert(`Cloud Backup failed: ${error.message}`)
    } finally {
      setIsSyncing(false)
      setSyncStatus(null)
    }
  }

  const handleCloudRestore = async () => {
    if (!confirm("This will overwrite existing scripts with the versions from the cloud. Are you sure?")) return

    setIsSyncing(true)
    setSyncStatus("Authenticating...")
    try {
      const token = await getAuthToken(true)
      setSyncStatus("Finding backup file...")
      const fileId = await findBackupFile(token)
      
      if (!fileId) {
        alert("No backup file found in your Google Drive.")
        return
      }

      setSyncStatus("Downloading data...")
      const backupData = await downloadBackup(token, fileId)
      setSyncStatus("Restoring data...")
      await restoreFromBackup(backupData)
      setLastSyncTimestamp(Date.now());
      alert("Successfully restored from Google Drive!")
      triggerSync() // Sync with browser registry
    } catch (error: any) {
      alert(`Cloud Restore failed: ${error.message}`)
    } finally {
      setIsSyncing(false)
      setSyncStatus(null)
    }
  }

  // Handle auto-sync toggle
  const handleAutoSyncToggle = async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    await configureAutoSync(enabled);
  };

  // Handle sync frequency change
  const handleSyncFrequencyChange = async (intervalMinutes: number) => {
    setSyncIntervalMinutes(intervalMinutes);
    await configureAutoSync(autoSyncEnabled, intervalMinutes);
  };

  // Format last sync time
  const formatLastSyncTime = () => {
    if (!lastSyncTimestamp) return "Never";
    const date = new Date(lastSyncTimestamp);
    return date.toLocaleString();
  };

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
          onExport={handleExport}
          onBulkEnable={handleBulkEnable}
          onBulkDisable={handleBulkDisable}
          onBulkDelete={handleBulkDelete}
          onBulkExport={handleBulkExport}
          darkMode={darkMode}
        />
      </>
      <div className="flex-1 h-full flex flex-col">
        {/* Tab Switcher */}
        <div className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-2">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('scripts')}
              className={`px-4 py-2 rounded-md transition-colors ${
                activeTab === 'scripts'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              Scripts
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <BarChart3 size={16} />
              Statistics
            </button>
          </div>
        </div>
        
        {/* Scripts Tab Content */}
        {activeTab === 'scripts' && (
          <>
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
            
            {/* Cloud Sync Section */}
            <div className="flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800 pl-4 ml-4">
              <button
                onClick={handleCloudBackup}
                disabled={isSyncing}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-sky-500 transition-colors flex items-center gap-2"
                title="Backup to Cloud"
              >
                {isSyncing && syncStatus?.includes("Upload") ? <RefreshCw size={18} className="animate-spin" /> : <CloudUpload size={18} />}
                <span className="text-sm hidden xl:inline">Backup</span>
              </button>
              <button
                onClick={handleCloudRestore}
                disabled={isSyncing}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-amber-500 transition-colors flex items-center gap-2"
                title="Restore from Cloud"
              >
                {isSyncing && syncStatus?.includes("Download") ? <RefreshCw size={18} className="animate-spin" /> : <CloudDownload size={18} />}
                <span className="text-sm hidden xl:inline">Restore</span>
              </button>
              {isSyncing && (
                <span className="text-xs text-sky-500 animate-pulse ml-2 px-2 py-1 bg-sky-500/10 rounded-full">
                  {syncStatus}
                </span>
              )}
            </div>

            {/* Auto-Sync Configuration */}
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-zinc-200 dark:border-zinc-800">
              <Settings size={16} className="text-zinc-500 dark:text-zinc-400" />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={(e) => handleAutoSyncToggle(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Auto-sync</span>
                </label>
              </div>
              
              {autoSyncEnabled && (
                <>
                  <select
                    value={syncIntervalMinutes}
                    onChange={(e) => handleSyncFrequencyChange(Number(e.target.value))}
                    className="text-sm border border-zinc-300 dark:border-zinc-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    {SYNC_FREQUENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  
                  <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <Clock size={12} />
                    <span>Last: {formatLastSyncTime()}</span>
                  </div>
                </>
              )}
              
              {!isLoadingSyncSettings && !autoSyncEnabled && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Enable auto-sync for scheduled backups
                </span>
              )}
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
          </>
        )}
        
        <div className="flex-1 h-full overflow-hidden">
          {activeTab === 'scripts' ? (
            selectedScript ? (
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
            )
          ) : (
            /* Statistics Tab */
            <div className="h-full overflow-auto p-6">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Script Statistics</h2>
              
              {isLoadingStats ? (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw size={24} className="animate-spin text-zinc-400" />
                </div>
              ) : stats.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                  <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No script statistics yet.</p>
                  <p className="text-sm mt-2">Scripts will be tracked once they are executed.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {stats.map((stat) => (
                    <div
                      key={stat.scriptId}
                      className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                          {scriptIdToNameMap[stat.scriptId] || stat.scriptId}
                        </h3>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {formatLastRun(stat.lastRun)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-md p-3">
                          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                            {stat.runCount}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                            Runs
                          </div>
                        </div>
                        
                        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-md p-3">
                          <div className={`text-2xl font-semibold ${stat.totalErrors > 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {stat.totalErrors}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                            Errors
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const OptionsIndex = () => (
  <ToastProvider>
    <OptionsIndexInner />
  </ToastProvider>
)

export default OptionsIndex
