import React from "react"
import { type UserScript } from "~lib/types"
import { FileCode, Power, Trash2, Plus } from "lucide-react"
import clsx from "clsx"

interface ScriptListProps {
  scripts: UserScript[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onCreate: () => void
}

export const ScriptList: React.FC<ScriptListProps> = ({
  scripts,
  selectedId,
  onSelect,
  onToggle,
  onDelete,
  onCreate
}) => {
  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-700 w-64">
      <div className="p-4 border-b border-zinc-700 flex justify-between items-center">
        <h1 className="text-xl font-bold text-emerald-500">AnotherMonkey</h1>
        <button onClick={onCreate} className="p-2 hover:bg-zinc-800 rounded-md text-emerald-400">
            <Plus size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {scripts.map((script) => (
          <div
            key={script.id}
            onClick={() => onSelect(script.id)}
            className={clsx(
              "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors group",
              selectedId === script.id ? "bg-zinc-800 border-l-4 border-emerald-500" : "hover:bg-zinc-800/50"
            )}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <FileCode size={18} className="text-zinc-400 shrink-0" />
              <div className="truncate">
                <div className="font-medium text-sm text-zinc-200 truncate">{script.metadata.name}</div>
                <div className="text-xs text-zinc-500 truncate">{script.metadata.version}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggle(script.id, !script.enabled) }}
                    className={clsx("p-1 rounded hover:bg-zinc-700", script.enabled ? "text-emerald-500" : "text-zinc-600")}
                >
                    <Power size={14} />
                </button>
                 <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(script.id) }}
                    className="p-1 rounded hover:bg-red-900/50 text-zinc-600 hover:text-red-400"
                >
                    <Trash2 size={14} />
                </button>
            </div>
          </div>
        ))}
        {scripts.length === 0 && (
            <div className="text-center text-zinc-500 mt-10 text-sm">
                No scripts installed.
            </div>
        )}
      </div>
    </div>
  )
}
