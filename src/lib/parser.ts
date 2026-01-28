import type { ScriptMetadata } from "./types"

// Helper to create a default metadata object.
// These are the absolute minimum defaults.
function createDefaultMetadata(): ScriptMetadata {
    return {
        name: "",
        version: "0.0.0",
        matches: [],
        excludes: [],
        includes: [],
        grants: [],
        connects: [],
        requires: [],
        resources: [],
        runAt: "document_idle",
        noframes: false,
    };
}


/**
 * Parses the metadata block of a userscript.
 * @param code The source code of the script.
 * @returns A structured metadata object.
 * @throws An error if the metadata block is missing or invalid.
 */
export function parseMetadata(code: string): ScriptMetadata {
  // 1. Handle BOM (Byte Order Mark) by removing it if present.
  if (code.charCodeAt(0) === 0xFEFF) {
    code = code.slice(1);
  }

  // 2. Extract the metadata block content.
  const metadataBlockRegex = /\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/
  const match = code.match(metadataBlockRegex)

  if (!match) {
    throw new Error("No valid metadata block found. The script must contain a header with // ==UserScript== and // ==/UserScript==.")
  }

  const metadataBlock = match[1]
  const lines = metadataBlock.split("\n")
  
  const metadata = createDefaultMetadata();
  const lineRegex = /^\s*\/\/\s*@([\w:-]+)(?:\s+(.*))?$/;

  for (const line of lines) {
    const lineMatch = line.trim().match(lineRegex)
    if (!lineMatch) continue

    const key = lineMatch[1].trim()
    const value = lineMatch[2] ? lineMatch[2].trim() : "";

    // Get the base key for localized keys like @name:en, @description:fr
    const baseKey = key.split(':', 1)[0];

    switch (baseKey) {
      case "name":
      case "namespace":
      case "version":
      case "description":
      case "author":
      case "updateURL":
      case "downloadURL":
        metadata[baseKey] = value;
        break;

      case "match":
        if (value) metadata.matches.push(value);
        break;
      case "exclude":
        if (value) metadata.excludes.push(value);
        break;
      case "include":
        if (value) metadata.includes.push(value);
        break;
      case "connect":
        if (value) metadata.connects.push(value);
        break;
      case "require":
        if (value) metadata.requires.push(value);
        break;
      case "grant":
        if (value) metadata.grants.push(value);
        break;

      case "resource":
        const resMatch = value.match(/^(\S+)\s+(.+)$/)
        if (resMatch) {
            const resource = { name: resMatch[1], url: resMatch[2] };
            // Prevent duplicates by name
            const existingIndex = metadata.resources.findIndex(r => r.name === resource.name);
            if (existingIndex !== -1) {
                metadata.resources[existingIndex] = resource; // Last one wins
            } else {
                metadata.resources.push(resource);
            }
        }
        break;
        
      case "run-at":
        if (value === "document-start" || value === "document-end" || value === "document-idle") {
           metadata.runAt = value
        }
        break;

      case "noframes":
        metadata.noframes = true;
        break;
      
      // Ignore unknown keys
      default:
        break;
    }
  }

  // A script is not valid without a name.
  if (!metadata.name) {
      throw new Error("The script is missing a required @name metadata field.");
  }
  
  // According to the spec, if @grant none is present with others, it's ignored.
  if (metadata.grants.includes("none") && metadata.grants.length > 1) {
    metadata.grants = metadata.grants.filter(g => g !== "none");
  }

  return metadata
}