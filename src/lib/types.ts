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
  connects: string[];
  runAt: 'document_start' | 'document_end' | 'document_idle';
  requires: string[];
  resources: { name: string; url: string; content?: string }[];
  updateURL?: string;
  downloadURL?: string;
}

export interface UserScript {
  id: string; // generated UUID
  enabled: boolean;
  code: string;
  metadata: ScriptMetadata;
  lastModified: number;
  dependencyCache?: {
      [url: string]: string;
  };
}

export interface UserScriptInjection {
  id: string;
  js: Array<{ code: string } | { file: string }>;
  matches?: string[];
  excludeMatches?: string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  world?: 'USER_SCRIPT' | 'MAIN';
}

export interface GMValue {
  scriptId: string;
  key: string;
  value: any;
}
