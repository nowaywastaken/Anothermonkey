export function matchPattern(pattern: string, url: string): boolean {
  if (pattern === "<all_urls>") return true;
  if (pattern === "*") return true; // Some legacy scripts use *

  try {
      // Handle Regex patterns
      if (pattern.startsWith("/") && pattern.endsWith("/")) {
          const regexStr = pattern.substring(1, pattern.length - 1);
          return new RegExp(regexStr).test(url);
      }

      // Handle standard Match Patterns (simplified for JS regex)
      // Reference: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
      
      let regexString = pattern;
      
      // Escape dots, pluses, etc.
      regexString = regexString.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      
      // Replace * with .*
      regexString = regexString.replace(/\\\*/g, '.*');
      
      // If it doesn't look like a full URL pattern (no scheme), assume it's a glob for the host/path
      if (!pattern.includes("://") && !pattern.startsWith("*://")) {
          // It's a simple glob or partial match
          return new RegExp(regexString).test(url);
      }

      const regex = new RegExp("^" + regexString + "$");
      return regex.test(url);
  } catch (e) {
      console.error("Invalid match pattern:", pattern, e);
      return false;
  }
}

export function matchesUrl(patterns: string[], url: string): boolean {
    if (!patterns || patterns.length === 0) return false;
    return patterns.some(p => matchPattern(p, url));
}

