export function matchPattern(pattern: string, url: string): boolean {
  if (pattern === "<all_urls>") return true
  if (pattern === "*://*/*") return true

  // Very basic glob to regex conversion
  // Escape special regex chars except *
  let regexString = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  
  // Handle the scheme separator
  regexString = "^" + regexString + "$";
  
  try {
      return new RegExp(regexString).test(url);
  } catch (e) {
      return false;
  }
}

export function matchesUrl(patterns: string[], url: string): boolean {
    return patterns.some(p => matchPattern(p, url));
}

