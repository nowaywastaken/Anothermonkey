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
export function parseMetadata(code: string): ScriptMetadata {
  // 1. Handle BOM (Byte Order Mark) by removing it if present.
  if (code.charCodeAt(0) === 0xfeff) {
    code = code.slice(1);
  }

  // 2. Extract the metadata block content.
  const metadataBlockRegex =
    /\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/;
  const match = code.match(metadataBlockRegex);

  if (!match) {
    throw new Error(
      "No valid metadata block found. The script must contain a header with // ==UserScript== and // ==/UserScript==.",
    );
  }

  const metadataBlock = match[1];
  const lines = metadataBlock.split("\n");

  const metadata = createDefaultMetadata();
  const lineRegex = /^\s*\/\/\s*@([\w:-]+)(?:\s+(.*))?$/;

  // Temporary storage for localized values
  const localized: { [key: string]: { [locale: string]: string } } = {
    name: {},
    description: {},
    author: {},
  };

  for (const line of lines) {
    const lineMatch = line.trim().match(lineRegex);
    if (!lineMatch) continue;

    const key = lineMatch[1].trim();
    const value = lineMatch[2] ? lineMatch[2].trim() : "";

    const [baseKey, locale] = key.split(":", 2);

    switch (baseKey) {
      case "name":
      case "description":
      case "author":
        localized[baseKey][locale || "default"] = value;
        break;

      case "namespace":
      case "version":
      case "updateURL":
      case "downloadURL":
        metadata[baseKey] = value;
        break;

      case "match":
        if (value && isValidMatchPattern(value)) {
          metadata.matches.push(value);
        } else if (value) {
          console.warn(`Skipping invalid @match pattern: ${value}`);
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
        } else if (value) {
          console.warn(`Skipping invalid @require URL: ${value}`);
        }
        break;
      case "grant":
        if (value) metadata.grants.push(value);
        break;

      case "resource":
        const resMatch = value.match(/^(\S+)\s+(.+)$/);
        if (resMatch) {
          const resourceUrl = resMatch[2];
          if (!isValidUrl(resourceUrl)) {
            console.warn(`Skipping invalid @resource URL: ${resourceUrl}`);
            break;
          }
          const resource = { name: resMatch[1], url: resourceUrl };
          // Prevent duplicates by name
          const existingIndex = metadata.resources.findIndex(
            (r) => r.name === resource.name,
          );
          if (existingIndex !== -1) {
            metadata.resources[existingIndex] = resource; // Last one wins
          } else {
            metadata.resources.push(resource);
          }
        }
        break;

      case "run-at":
        if (
          value === "document-start" ||
          value === "document-end" ||
          value === "document-idle"
        ) {
          metadata.runAt =
            value === "document-start"
              ? "document_start"
              : value === "document-end"
                ? "document_end"
                : "document_idle";
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

  // Helper to select the best localized string
  function selectLocalized(
    values: { [locale: string]: string },
    fallback?: string,
  ): string {
    if (typeof navigator === "undefined")
      return values["default"] || fallback || "";

    const lang = navigator.language; // e.g., "en-US"
    if (values[lang]) {
      return values[lang];
    }
    const langPart = lang.split("-")[0]; // e.g., "en"
    if (values[langPart]) {
      return values[langPart];
    }
    return values["default"] || fallback || "";
  }

  metadata.name = selectLocalized(localized.name);
  metadata.description = selectLocalized(localized.description);
  metadata.author = selectLocalized(localized.author);

  // A script is not valid without a name.
  if (!metadata.name) {
    throw new Error("The script is missing a required @name metadata field.");
  }

  // According to the spec, if @grant none is present with others, it's ignored.
  if (metadata.grants.includes("none") && metadata.grants.length > 1) {
    metadata.grants = metadata.grants.filter((g) => g !== "none");
  }

  return metadata;
}
