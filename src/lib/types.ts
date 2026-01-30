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
  noframes?: boolean;
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
  preferredWorld?: 'USER_SCRIPT' | 'MAIN';
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

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  session: boolean;
  hostOnly: boolean;
  sameSite: "no_restriction" | "lax" | "strict" | "unspecified";
}

export interface GMCookieDetails {
  url: string;
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expirationDate?: number;
  storeId?: string;
}

export interface GMNotificationButton {
  title: string;
  onClick?: () => void;
}

export interface GMNotificationDetails {
  text?: string;
  title?: string;
  imageUrl?: string;
  onclick?: () => void;
  ondone?: () => void;
  buttons?: GMNotificationButton[];
  timeout?: number;
}

export interface UserPermission {
  scriptId: string;
  domain: string;
  allow: boolean;
}

export interface SyncItem {
  id: string;
  scriptId: string;
  lastSynced: number;
  remoteId?: string;
  status: 'synced' | 'pending' | 'conflict';
}
