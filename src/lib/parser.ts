import type { ScriptMetadata } from "./types";

// Allowed URL protocols for @require and @resource
const ALLOWED_PROTOCOLS = ['https:', 'http:', 'data:'];

/**
 * Validates a URL for security concerns
 * @returns true if URL is safe, false otherwise
 */
function isValidUrl(urlString: string): boolean {
  // Allow data: URLs for inline resources
  if (urlString.startsWith('data:')) return true;
  
  try {
    const url = new URL(urlString);
    return ALLOWED_PROTOCOLS.includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Validates @match pattern format
 */
function isValidMatchPattern(pattern: string): boolean {
  // Special patterns
  if (pattern === '<all_urls>' || pattern === '*') return true;
  
  // Regex patterns are allowed
  if (pattern.startsWith('/') && pattern.endsWith('/')) return true;
  
  // Standard match pattern: scheme://host/path
  const matchPatternRegex = /^(\*|https?|file|ftp):\/\/([\w*.\-]+|\*)(\/.*)?$/;
  return matchPatternRegex.test(pattern);
}

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
/**
 * Parses the metadata block of a userscript.
 * Uses a more efficient single-pass regex approach for large blocks.
 * @param code The source code of the script.
 * @returns A structured metadata object.
 */
export function parseMetadata(code: string): ScriptMetadata {
  // 1. Handle BOM (Byte Order Mark)
  if (code.charCodeAt(0) === 0xfeff) {
    code = code.slice(1);
  }

  // 2. Extract the metadata block content.
  const metadataBlockRegex = /\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/;
  const match = code.match(metadataBlockRegex);

  if (!match) {
    throw new Error(
      "No valid metadata block found. The script must contain a header with // ==UserScript== and // ==/UserScript==.",
    );
  }

  const metadataBlock = match[1];
  const metadata = createDefaultMetadata();
  
  // Localized values storage
  const localized: Record<string, Record<string, string>> = {
    name: {},
    description: {},
    author: {},
  };

  /**
   * Streaming-friendly regex for attributes.
   * Matches lines like "// @key value" or "// @key:locale value"
   */
  const attrRegex = /^\s*\/\/\s*@([\w:.-]+)(?:\s+(.*))?$/gm;
  let attrMatch;

  while ((attrMatch = attrRegex.exec(metadataBlock)) !== null) {
    const key = attrMatch[1].trim();
    const value = attrMatch[2] ? attrMatch[2].trim() : "";
    if (!key) continue;

    const [baseKey, locale] = key.split(":", 2);
    const targetLocale = locale || "default";

    switch (baseKey) {
      case "name":
      case "description":
      case "author":
        localized[baseKey][targetLocale] = value;
        break;

      case "namespace":
      case "version":
      case "updateURL":
      case "downloadURL":
      case "supportURL":
      case "homepage":
      case "homepageURL":
      case "website":
      case "source":
      case "icon":
      case "iconURL":
      case "defaulticon":
      case "icon64":
      case "icon64URL":
        (metadata as any)[baseKey] = value;
        break;

      case "match":
        if (value && isValidMatchPattern(value)) {
          metadata.matches.push(value);
        }
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
        if (value && isValidUrl(value)) {
          metadata.requires.push(value);
        }
        break;

      case "grant":
        if (value && !metadata.grants.includes(value)) {
          metadata.grants.push(value);
        }
        break;

      case "resource":
        const resMatch = value.match(/^(\S+)\s+(.+)$/);
        if (resMatch && isValidUrl(resMatch[2])) {
          const resource = { name: resMatch[1], url: resMatch[2] };
          const existing = metadata.resources.findIndex(r => r.name === resource.name);
          if (existing !== -1) {
            metadata.resources[existing] = resource;
          } else {
            metadata.resources.push(resource);
          }
        }
        break;

      case "run-at":
        const normalizedRunAt = value.replace(/-/g, "_");
        if (["document_start", "document_end", "document_idle", "document_body"].includes(normalizedRunAt)) {
          metadata.runAt = normalizedRunAt as any;
        }
        break;

      case "noframes":
        metadata.noframes = true;
        break;

      case "unwrap":
        (metadata as any).unwrap = true;
        break;
    }
  }

  // Resolve localization
  const getLocalized = (vals: Record<string, string>, fallback = "") => {
    if (typeof navigator === "undefined") return vals["default"] || fallback;
    const lang = navigator.language;
    return vals[lang] || vals[lang.split("-")[0]] || vals["default"] || fallback;
  };

  metadata.name = getLocalized(localized.name);
  metadata.description = getLocalized(localized.description);
  metadata.author = getLocalized(localized.author);

  if (!metadata.name) {
    throw new Error("The script is missing a required @name metadata field.");
  }

  // Deduplicate and cleanup grants
  if (metadata.grants.includes("none") && metadata.grants.length > 1) {
    metadata.grants = metadata.grants.filter((g) => g !== "none");
  }

  // Pre-compiled metadata hash for SW fast-load (as required by spec)
  (metadata as any)._hash = btoa(JSON.stringify(metadata)).substring(0, 16);

  return metadata;
}

