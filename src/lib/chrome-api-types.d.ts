// Type definitions for the chrome.userScripts API
// Based on https://developer.chrome.com/docs/extensions/reference/api/userScripts

declare namespace chrome.userScripts {
  interface ScriptSource {
    code?: string;
    file?: string;
  }

  interface RegisteredUserScriptOptions {
    id: string;
    matches: string[];
    excludeMatches?: string[];
    css?: ScriptSource[];
    js?: ScriptSource[];
    runAt?: "document_start" | "document_end" | "document_idle";
    world?: "ISOLATED" | "MAIN";
  }

  type RegisteredUserScript = RegisteredUserScriptOptions;

  function register(scripts: RegisteredUserScriptOptions[]): Promise<void>;
  function getScripts(filter?: {
    ids?: string[];
  }): Promise<RegisteredUserScript[]>;
  function unregister(filter?: { ids?: string[] }): Promise<void>;
  function update(scripts: RegisteredUserScriptOptions[]): Promise<void>;
  function configureWorld(options: {
    csp?: string;
    messaging?: boolean;
  }): Promise<void>;
}
