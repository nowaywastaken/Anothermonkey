import React, { useEffect, useState } from "react"
import Editor from "@monaco-editor/react"
import { Save, AlertCircle } from "lucide-react"

interface ScriptEditorProps {
  initialCode: string
  onSave: (code: string) => void
  onChange: (code: string) => void
  isDirty: boolean
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ initialCode, onSave, onChange, isDirty }) => {
  const [code, setCode] = useState(initialCode)

  useEffect(() => {
    setCode(initialCode)
  }, [initialCode])

  const handleChange = (value: string | undefined) => {
      const newCode = value || ""
      setCode(newCode)
      onChange(newCode)
  }

  const handleSave = () => {
    onSave(code)
  }

  // Ctrl+S handler
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
              e.preventDefault()
              handleSave()
          }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
  }, [code])

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2 px-2">
            <span className="text-zinc-400 text-sm">Editor</span>
            {isDirty && <span className="text-amber-500 text-xs flex items-center gap-1"><AlertCircle size={12}/> Unsaved changes</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            isDirty 
            ? "bg-emerald-600 text-white hover:bg-emerald-500" 
            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
          }`}
        >
          <Save size={16} />
          Save
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          value={code}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'Fira Code', 'Menlo', 'Monaco', 'Courier New', monospace",
            scrollBeyondLastLine: false,
            automaticLayout: true
          }}
        />
      </div>
    </div>
  )
}