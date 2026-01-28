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
        metadata.name = value
        break
      case "namespace":
        metadata.namespace = value
        break
      case "version":
        metadata.version = value
        break
      case "description":
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
        metadata.grants.push(value)
        break
      case "require":
        metadata.requires.push(value)
        break
      case "resource":
        // Resource format: name url
        const [resName, ...resUrlParts] = value.split(/\s+/)
        if (resName && resUrlParts.length > 0) {
            metadata.resources.push({
                name: resName,
                url: resUrlParts.join(" ")
            })
        }
        break
      case "run-at":
        if (value === "document-start" || value === "document-end" || value === "document-idle") {
           metadata.runAt = value.replace("-", "_") as any
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
