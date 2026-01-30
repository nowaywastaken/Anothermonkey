import React, { useEffect, useState, useCallback } from "react"
import Editor, { type BeforeMount } from "@monaco-editor/react"
import { Save, AlertCircle, Loader2 } from "lucide-react"
import { GM_TYPES } from "~lib/gm-types"

interface ScriptEditorProps {
  initialCode: string
  onSave: (code: string) => void
  onChange: (code: string) => void
  isDirty: boolean
  isSaving: boolean
  darkMode: boolean | null
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ initialCode, onSave, onChange, isDirty, isSaving, darkMode }) => {
  const [code, setCode] = useState(initialCode)
  const [editorTheme, setEditorTheme] = useState<'vs' | 'vs-dark'>('vs-dark')

  useEffect(() => {
    setCode(initialCode)
  }, [initialCode])

  // Update editor theme based on dark mode
  useEffect(() => {
    if (darkMode === null) {
      // Default to dark theme if not initialized yet
      setEditorTheme('vs-dark')
    } else {
      setEditorTheme(darkMode ? 'vs-dark' : 'vs')
    }
  }, [darkMode])

  const handleChange = (value: string | undefined) => {
    const newCode = value || ""
    setCode(newCode)
    onChange(newCode)
  }

  const handleSave = useCallback(() => {
    if (!isSaving) {
      onSave(code)
    }
  }, [code, isSaving, onSave])

  const handleEditorWillMount = (monaco: any) => {
    // Add GM API types to the editor
    monaco.languages.typescript.javascriptDefaults.setExtraLibs([{
      content: GM_TYPES,
      filePath: 'ts:gm.d.ts'
    }]);

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        allowNonTsExtensions: true,
        target: monaco.languages.typescript.ScriptTarget.ESNext,
    });
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
  }, [handleSave])

  return (
    <div className="flex flex-col h-full bg-zinc-100 dark:bg-zinc-950">
      <div className="flex items-center justify-between p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-200 dark:bg-zinc-900">
        <div className="flex items-center gap-2 px-2">
          <span className="text-zinc-700 dark:text-zinc-400 text-sm">Editor</span>
          {isDirty && !isSaving && <span className="text-amber-500 text-xs flex items-center gap-1"><AlertCircle size={12}/> Unsaved changes</span>}
          {isSaving && <span className="text-sky-500 text-xs flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Saving...</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-colors w-[100px] ${
            (!isDirty || isSaving)
            ? "bg-zinc-300 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 cursor-not-allowed"
            : "bg-emerald-600 text-white hover:bg-emerald-500" 
          }`}
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme={editorTheme}
          value={code}
          onChange={handleChange}
          beforeMount={handleEditorWillMount}
          options={{
            minimap: { enabled: true, scale: 0.8 },
            fontSize: 14,
            fontFamily: "'Fira Code', 'Menlo', 'Monaco', 'Courier New', monospace",
            fontLigatures: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            autoIndent: 'full',
            formatOnPaste: true,
            formatOnType: true,
            folding: true,
            foldingHighlight: true,
            showFoldingControls: 'always',
            renderLineHighlight: 'all',
            renderWhitespace: 'selection',
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            wordWrap: 'off',
            tabSize: 2,
            lineNumbers: 'on',
            glyphMargin: true,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
          }}
        />
      </div>
    </div>
  )
}
