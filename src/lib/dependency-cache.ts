
import { logger } from "./logger";

export const DEFAULT_DEPENDENCY_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CachedDependency {
  url: string;
  content: string;
  lastModified: number;
  expiry?: number;
}

export type DependencyCache = Record<string, CachedDependency>;

// Legacy format was just Record<string, string> (url -> content)
export type LegacyDependencyCache = Record<string, string>;

export function fromLegacyCacheFormat(legacy: LegacyDependencyCache): DependencyCache {
  const cache: DependencyCache = {};
  for (const [url, content] of Object.entries(legacy)) {
    cache[url] = {
      url,
      content,
      lastModified: Date.now(), // Estimate
      expiry: Date.now() + DEFAULT_DEPENDENCY_TTL
    };
  }
  return cache;
}

export function toLegacyCacheFormat(cache: DependencyCache): LegacyDependencyCache {
  const legacy: LegacyDependencyCache = {};
  for (const [url, dep] of Object.entries(cache)) {
    legacy[url] = dep.content;
  }
  return legacy;
}

export async function fetchScriptDependencies(
  requires: string[],
  resources: { name: string; url: string }[],
  existingCache: DependencyCache,
  ttl: number = DEFAULT_DEPENDENCY_TTL
): Promise<DependencyCache> {
  const newCache: DependencyCache = { ...existingCache };
  const now = Date.now();

  const allUrls = [
    ...requires,
    ...resources.map(r => r.url)
  ];

  // Unique URLs
  const uniqueUrls = Array.from(new Set(allUrls));

  await Promise.all(uniqueUrls.map(async (url) => {
    // Check if cached and valid
    const cached = newCache[url];
    if (cached && (cached.expiry === undefined || cached.expiry > now)) {
      return;
    }

    try {
      logger.info(`Fetching dependency: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
      }
      const content = await response.text();
      newCache[url] = {
        url,
        content,
        lastModified: now,
        expiry: now + ttl
      };
    } catch (e) {
      logger.error(`Error fetching dependency ${url}:`, e);
      // If we have a stale version, keep it, otherwise... nothing.
    }
  }));

  return newCache;
}
