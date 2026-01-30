import React, { useState, useMemo, useEffect, useCallback } from "react"
import { type UserScript } from "~lib/types"
import { FileCode, Power, Trash2, Plus, Search, Filter, X, Upload, CheckSquare, Square } from "lucide-react"
import clsx from "clsx"

interface ScriptListProps {
  scripts: UserScript[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onCreate: () => void
  onImport: () => void
  onBulkEnable?: (ids: string[]) => void
  onBulkDisable?: (ids: string[]) => void
  onBulkDelete?: (ids: string[]) => void
  darkMode?: boolean | null
}

type StatusFilter = "all" | "enabled" | "disabled"

export const ScriptList: React.FC<ScriptListProps> = ({
  scripts,
  selectedId,
  onSelect,
  onToggle,
  onDelete,
  onCreate,
  onImport,
  onBulkEnable,
  onBulkDisable,
  onBulkDelete,
  darkMode
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Filter scripts based on search query and status
  const filteredScripts = useMemo(() => {
    const query = debouncedQuery.toLowerCase().trim()

    return scripts.filter((script) => {
      // Status filter
      if (statusFilter === "enabled" && !script.enabled) return false
      if (statusFilter === "disabled" && script.enabled) return false

      // Search filter (name, namespace, description)
      if (query) {
        const nameMatch = script.metadata.name?.toLowerCase().includes(query)
        const namespaceMatch = script.metadata.namespace?.toLowerCase().includes(query)
        const descriptionMatch = script.metadata.description?.toLowerCase().includes(query)
        if (!nameMatch && !namespaceMatch && !descriptionMatch) return false
      }

      return true
    })
  }, [scripts, debouncedQuery, statusFilter])

  const clearSearch = () => {
    setSearchQuery("")
    setDebouncedQuery("")
  }

  // Selection handlers
  const handleToggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  const handleSelectAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredScripts.map(s => s.id)))
    } else {
      setSelectedIds(new Set())
    }
  }, [filteredScripts])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleBulkEnable = useCallback(() => {
    if (onBulkEnable && selectedIds.size > 0) {
      onBulkEnable(Array.from(selectedIds))
      setSelectedIds(new Set())
    }
  }, [selectedIds, onBulkEnable])

  const handleBulkDisable = useCallback(() => {
    if (onBulkDisable && selectedIds.size > 0) {
      onBulkDisable(Array.from(selectedIds))
      setSelectedIds(new Set())
    }
  }, [selectedIds, onBulkDisable])

  const handleBulkDelete = useCallback(() => {
    if (onBulkDelete && selectedIds.size > 0) {
      if (window.confirm(`Are you sure you want to delete ${selectedIds.size} script(s)?`)) {
        onBulkDelete(Array.from(selectedIds))
        setSelectedIds(new Set())
      }
    }
  }, [selectedIds, onBulkDelete])

  // Determine button states
  const selectedScripts = scripts.filter(s => selectedIds.has(s.id))
  const allSelectedEnabled = selectedScripts.length > 0 && selectedScripts.every(s => s.enabled)
  const allSelectedDisabled = selectedScripts.length > 0 && selectedScripts.every(s => !s.enabled)
  const hasBulkActions = selectedIds.size > 0

  return (
    <div className="flex flex-col h-full bg-zinc-200 dark:bg-zinc-900 border-r border-zinc-300 dark:border-zinc-700 w-80">
      <div className="p-4 border-b border-zinc-300 dark:border-zinc-700 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-emerald-600 dark:text-emerald-500">AnotherMonkey</h1>
          <div className="flex items-center gap-1">
            <button 
              onClick={onImport}
              className="p-2 hover:bg-zinc-300 dark:hover:bg-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
              title="Import"
            >
              <Upload size={20} />
            </button>
            <button onClick={onCreate} className="p-2 hover:bg-zinc-300 dark:hover:bg-zinc-800 rounded-md text-emerald-600 dark:text-emerald-400 transition-colors">
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
          <input
            type="text"
            placeholder="Search scripts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md text-sm text-zinc-900 dark:text-zinc-200 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md text-sm text-zinc-900 dark:text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer appearance-none"
            >
              <option value="all">All</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          {/* Script Count */}
          <span className="text-xs text-zinc-600 dark:text-zinc-500 whitespace-nowrap">
            Showing {filteredScripts.length} of {scripts.length}
          </span>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {hasBulkActions && (
        <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700 flex items-center justify-between">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">{selectedIds.size} script{selectedIds.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleBulkEnable}
              disabled={allSelectedEnabled}
              className={clsx(
                "px-2 py-1 text-xs rounded transition-colors",
                allSelectedEnabled 
                  ? "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/70 dark:bg-emerald-900/50 dark:text-emerald-400"
              )}
              title={allSelectedEnabled ? "All selected scripts are already enabled" : "Enable selected scripts"}
            >
              Enable
            </button>
            <button
              onClick={handleBulkDisable}
              disabled={allSelectedDisabled}
              className={clsx(
                "px-2 py-1 text-xs rounded transition-colors",
                allSelectedDisabled 
                  ? "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-yellow-900/50 text-yellow-400 hover:bg-yellow-900/70 dark:bg-yellow-900/50 dark:text-yellow-400"
              )}
              title={allSelectedDisabled ? "All selected scripts are already disabled" : "Disable selected scripts"}
            >
              Disable
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-2 py-1 text-xs rounded bg-red-900/50 text-red-400 hover:bg-red-900/70 transition-colors"
              title="Delete selected scripts"
            >
              Delete
            </button>
            <button
              onClick={handleClearSelection}
              className="px-2 py-1 text-xs rounded bg-zinc-300 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-colors"
              title="Clear selection"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Script List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredScripts.length > 0 ? (
          <>
            {/* Select All Header */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50">
              <button
                onClick={(e) => handleSelectAll({ target: { checked: selectedIds.size !== filteredScripts.length } } as React.ChangeEvent<HTMLInputElement>)}
                className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                {selectedIds.size === filteredScripts.length ? (
                  <CheckSquare size={16} className="text-emerald-500" />
                ) : (
                  <Square size={16} />
                )}
                Select All
              </button>
            </div>
            
            {filteredScripts.map((script) => (
              <div
                key={script.id}
                onClick={() => onSelect(script.id)}
                className={clsx(
                  "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors group",
                  selectedId === script.id 
                    ? "bg-zinc-300 dark:bg-zinc-800 border-l-4 border-emerald-500" 
                    : "hover:bg-zinc-200 dark:hover:bg-zinc-800/50"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <button
                    onClick={(e) => handleToggleSelect(script.id, e)}
                    className="shrink-0 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                  >
                    {selectedIds.has(script.id) ? (
                      <CheckSquare size={18} className="text-emerald-500" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                  <FileCode size={18} className="text-zinc-500 dark:text-zinc-400 shrink-0" />
                  <div className="truncate">
                    <div className="font-medium text-sm text-zinc-900 dark:text-zinc-200 truncate">{script.metadata.name}</div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-500 truncate">
                      {script.metadata.namespace && `${script.metadata.namespace} • `}
                      v{script.metadata.version}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                      onClick={(e) => { e.stopPropagation(); onToggle(script.id, !script.enabled) }}
                      className={clsx("p-1.5 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors", script.enabled ? "text-emerald-500" : "text-zinc-500 dark:text-zinc-600")}
                      title={script.enabled ? "Disable" : "Enable"}
                  >
                      <Power size={16} />
                  </button>
                  <button 
                      onClick={(e) => { e.stopPropagation(); onDelete(script.id) }}
                      className="p-1.5 rounded hover:bg-red-900/50 text-zinc-500 dark:text-zinc-600 hover:text-red-400 transition-colors"
                      title="Delete"
                  >
                      <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : scripts.length === 0 ? (
          <div className="text-center text-zinc-600 dark:text-zinc-500 mt-10 text-sm">
            No scripts installed.
          </div>
        ) : (
          <div className="text-center text-zinc-600 dark:text-zinc-500 mt-10 text-sm">
            No scripts found.
          </div>
        )}
      </div>
    </div>
  )
}
