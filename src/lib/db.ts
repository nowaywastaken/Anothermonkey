import Dexie, { type Table } from "dexie"
import type { UserScript, GMValue } from "./types"

export class ScriptDatabase extends Dexie {
  scripts!: Table<UserScript, string>
  values!: Table<GMValue, [string, string]>

  constructor() {
    super("AnotherMonkeyDB")
    this.version(1).stores({
      scripts: "id, enabled, lastModified, metadata.name",
      values: "[scriptId+key], scriptId"
    })
  }
}

export const db = new ScriptDatabase()
