import React, { useState, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "~lib/db"
import { parseMetadata } from "~lib/parser"
import { ScriptList } from "~components/ScriptList"
import { ScriptEditor } from "~components/ScriptEditor"
import { type UserScript } from "~lib/types"

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      <ScriptList
        scripts={scripts}
        selectedId={selectedId}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onCreate={handleCreate}
      />
      <div className="flex-1 h-full">
        {selectedScript ? (
          <ScriptEditor
            key={selectedScript.id} // Re-mount on ID change to reset editor state if needed
            initialCode={selectedScript.code}
            onSave={handleSave}
            onChange={handleEditorChange}
            isDirty={isDirty}
            isSaving={isSaving}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600">
            Select a script to edit
          </div>
        )}
      </div>
    </div>
  )
}

export default OptionsIndex
