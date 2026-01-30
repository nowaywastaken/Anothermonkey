import { db, type ScriptStats } from './db'

/**
 * Record a script execution
 */
export async function recordScriptRun(scriptId: string): Promise<void> {
  const now = Date.now()
  const existing = await db.scriptStats.get(scriptId)
  
  if (existing) {
    await db.scriptStats.update(scriptId, {
      runCount: existing.runCount + 1,
      lastRun: now,
    })
  } else {
    await db.scriptStats.add({
      scriptId,
      runCount: 1,
      lastRun: now,
      totalErrors: 0,
    })
  }
}

/**
 * Record a script error
 */
export async function recordScriptError(scriptId: string): Promise<void> {
  const existing = await db.scriptStats.get(scriptId)
  
  if (existing) {
    await db.scriptStats.update(scriptId, {
      totalErrors: existing.totalErrors + 1,
    })
  } else {
    await db.scriptStats.add({
      scriptId,
      runCount: 0,
      lastRun: 0,
      totalErrors: 1,
    })
  }
}

/**
 * Get statistics for a script
 */
export async function getScriptStats(scriptId: string): Promise<ScriptStats | null> {
  const stats = await db.scriptStats.get(scriptId)
  return stats || null
}

/**
 * Get statistics for all scripts
 */
export async function getAllScriptStats(): Promise<ScriptStats[]> {
  return await db.scriptStats.toArray()
}

/**
 * Format last run time as a human-readable string
 */
export function formatLastRun(timestamp: number): string {
  if (!timestamp) return 'Never'
  
  const now = Date.now()
  const diff = now - timestamp
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'Just now'
}
