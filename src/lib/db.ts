import Dexie, { type Table } from "dexie"
import type { UserScript } from "./types"

export class ScriptDatabase extends Dexie {
  scripts!: Table<UserScript, string>

  constructor() {
    super("AnotherMonkeyDB")
    this.version(1).stores({
      scripts: "id, enabled, lastModified, metadata.name"
    })
  }
}

export const db = new ScriptDatabase()
