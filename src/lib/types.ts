export interface ScriptMetadata {
  name: string;
  namespace?: string;
  version: string;
  description?: string;
  author?: string;
  matches: string[];
  excludes: string[];
  includes: string[];
  grants: string[];
  runAt: 'document_start' | 'document_end' | 'document_idle';
  requires: string[];
  resources: { name: string; url: string }[];
  updateURL?: string;
  downloadURL?: string;
}

export interface UserScript {
  id: string; // generated UUID
  enabled: boolean;
  code: string;
  metadata: ScriptMetadata;
  lastModified: number;
}
