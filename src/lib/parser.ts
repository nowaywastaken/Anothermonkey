import type { ScriptMetadata } from "./types"

export function parseMetadata(code: string): ScriptMetadata {
  const metadataBlockRegex = /\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/
  const match = code.match(metadataBlockRegex)

  if (!match) {
    throw new Error("No metadata block found")
  }

  const metadataBlock = match[1]
  const lines = metadataBlock.split("\n")
  
  const metadata: ScriptMetadata = {
    name: "New Script",
    version: "0.1",
    matches: [],
    excludes: [],
    includes: [],
    grants: [],
    connects: [],
    requires: [],
    resources: [],
    runAt: "document_idle"
  }

  const lineRegex = /^\s*\/\/\s*@([\w:-]+)(?:\s+(.*))?$/

  for (const line of lines) {
    const lineMatch = line.match(lineRegex)
    if (!lineMatch) continue

    const key = lineMatch[1].trim()
    const value = lineMatch[2] ? lineMatch[2].trim() : ""

    switch (key) {
      case "name":
      case "name:zh-CN": // Basic support for localized names
        metadata.name = value
        break
      case "namespace":
        metadata.namespace = value
        break
      case "version":
        metadata.version = value
        break
      case "description":
      case "description:zh-CN":
        metadata.description = value
        break
      case "author":
        metadata.author = value
        break
      case "match":
        metadata.matches.push(value)
        break
      case "exclude":
        metadata.excludes.push(value)
        break
      case "include":
        metadata.includes.push(value)
        break
      case "grant":
        if (!metadata.grants.includes(value)) {
            metadata.grants.push(value)
        }
        break
      case "connect":
        if (!metadata.connects.includes(value)) {
            metadata.connects.push(value)
        }
        break
      case "require":
        metadata.requires.push(value)
        break
      case "resource":
        // Resource format: name url
        const resMatch = value.match(/^(\S+)\s+(.+)$/)
        if (resMatch) {
            metadata.resources.push({
                name: resMatch[1],
                url: resMatch[2]
            })
        }
        break
      case "run-at":
        const runAtValue = value.replace(/-/g, "_")
        if (runAtValue === "document_start" || runAtValue === "document_end" || runAtValue === "document_idle") {
           metadata.runAt = runAtValue as any
        }
        break
      case "updateURL":
        metadata.updateURL = value
        break
      case "downloadURL":
        metadata.downloadURL = value
        break
    }
  }

  return metadata
}
