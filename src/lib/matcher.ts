/**
 * This file provides robust URL matching functionality for userscripts,
 * supporting standard Chrome match patterns, regular expressions, and glob-style patterns
 * as seen in various userscript engines.
 */

/**
 * Converts a Chrome-style match pattern to a regular expression.
 * @param pattern The match pattern (e.g., "https://*.google.com/*").
 * @returns A RegExp object for matching URLs.
 * @throws An error if the pattern is syntactically invalid.
 *
 * @see https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
 */
function patternToRegExp(pattern: string): RegExp {
  if (pattern === '<all_urls>') {
    // Matches http, https, file, ftp.
    return /^(https?|file|ftp):\/\/.*/;
  }

  const match = /^(https?|\*|file|ftp):\/\/([^\/]+)(\/.*)$/.exec(pattern);
  if (!match) {
    throw new Error(`Invalid match pattern: ${pattern}`);
  }

  let [, scheme, host, path] = match;

  let re = '^' + (scheme === '*' ? 'https?' : scheme) + ':\/\/';

  if (host === '*') {
    re += '[^/]+';
  } else if (host.startsWith('*.')) {
    // A wildcard host "*.foo.com" matches "bar.foo.com" but not "foo.com".
    re += '[^/]+\.' + host.substring(2).replace(/\./g, '\\.');
  } else {
    re += host.replace(/\./g, '\\.');
  }

  // Escape special characters in path and then replace wildcard * with .*
  re += path.replace(/[?.+^${}()|[\\]/g, '\\$&').replace(/\\\*/g, '.*');
  re += '$';

  return new RegExp(re);
}

/**
 * Matches a URL against a single pattern, which can be a match pattern, a regex, or a glob.
 * @param pattern The pattern to test.
 * @param url The URL to test against the pattern.
 * @returns `true` if the URL matches the pattern, `false` otherwise.
 */
export function matchPattern(pattern: string, url: string): boolean {
  // Handle legacy Greasemonkey pattern
  if (pattern === '*') return true;
  if (pattern === '<all_urls>') {
    return /^(https?|file|ftp):\/\//.test(url);
  }

  // Handle regex patterns (from @include)
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    try {
      const regex = new RegExp(pattern.substring(1, pattern.length - 1));
      return regex.test(url);
    } catch (e) {
      console.error('Invalid regex pattern:', pattern, e);
      return false;
    }
  }

  // Handle standard Chrome match patterns
  if (pattern.includes('://')) {
    try {
      const regex = patternToRegExp(pattern);
      return regex.test(url);
    } catch (e) {
      // Fall through to glob matching for patterns like `*://*.google.com/*`
      // which are valid globs but not strict match patterns if malformed.
    }
  }

  // Handle glob patterns (from @include)
  try {
    const reString = pattern
      .replace(/[?.+^${}()|[\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${reString}$`);
    return regex.test(url);
  } catch (e) {
    console.error('Invalid glob pattern:', pattern, e);
    return false;
  }
}

/**
 * Checks if a URL matches any of a list of patterns.
 * @param patterns An array of patterns.
 * @param url The URL to check.
 * @returns `true` if the URL matches at least one pattern, `false` otherwise.
 */
export function matchesUrl(patterns: string[], url: string): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some(p => matchPattern(p, url));
}