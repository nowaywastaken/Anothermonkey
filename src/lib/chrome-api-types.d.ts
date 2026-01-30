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

// Type definitions for the chrome.cookies API
// Based on https://developer.chrome.com/docs/extensions/reference/api/cookies
declare namespace chrome.cookies {
  interface Cookie {
    name: string;
    value: string;
    domain: string;
    hostOnly: boolean;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: "no_restriction" | "lax" | "strict" | "unspecified";
    session: boolean;
    expirationDate?: number;
    storeId: string;
  }

  interface SetDetails {
    url: string;
    name?: string;
    value?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
    expirationDate?: number;
    storeId?: string;
  }

  interface GetAllDetails {
    url?: string;
    name?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    session?: boolean;
    storeId?: string;
  }

  interface RemoveDetails {
    url: string;
    name: string;
    storeId?: string;
  }

  function get(details: GetAllDetails): Promise<Cookie | null>;
  function getAll(details: GetAllDetails): Promise<Cookie[]>;
  function set(details: SetDetails): Promise<Cookie | null>;
  function remove(details: RemoveDetails): Promise<Cookie | null>;
}

// Type definitions for the chrome.runtime API
declare namespace chrome.runtime {
  interface Manifest {
    name: string;
    version: string;
    manifest_version: number;
    description?: string;
    permissions?: string[];
    host_permissions?: string[];
    [key: string]: unknown;
  }

  interface MessageSender {
    id?: string;
    tab?: tabs.Tab;
    url?: string;
    frameId?: number;
    tlsChannelId?: string;
  }

  interface Port {
    name: string;
    disconnect(): void;
    postMessage(message: unknown): void;
    sender?: MessageSender;
    onDisconnect: {
      addListener(callback: (port: Port) => void): void;
      removeListener(callback: (port: Port) => void): void;
    };
    onMessage: {
      addListener(callback: (message: unknown, port: Port) => void): void;
      removeListener(callback: (message: unknown, port: Port) => void): void;
    };
  }

  const lastError: { message?: string };

  function getManifest(): Manifest;
  function getURL(path: string): string;
  function sendMessage(message: unknown, callback?: (response: any) => void): Promise<unknown>;
  function openOptionsPage(): Promise<void>;

  const onMessage: {
    addListener(callback: (message: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => void): void;
    removeListener(callback: (message: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => void): void;
  };

  const onConnect: {
    addListener(callback: (port: Port) => void): void;
    removeListener(callback: (port: Port) => void): void;
  };
}

// Forward declarations for tabs namespace
declare namespace chrome.tabs {
  interface Tab {
    id?: number;
    index?: number;
    windowId?: number;
    openerTabId?: number;
    url?: string;
    title?: string;
    faviconUrl?: string;
    incognito?: boolean;
    pinned?: boolean;
    highlighted?: boolean;
    active?: boolean;
    selected?: boolean;
    discarded?: boolean;
    autoDiscardable?: boolean;
    groupId?: number;
    status?: "loading" | "complete";
    width?: number;
    height?: number;
  }

  interface TabQueryInfo {
    active?: boolean;
    currentWindow?: boolean;
    lastFocusedWindow?: boolean;
    pinned?: boolean;
    highlighted?: boolean;
    index?: number;
    status?: "loading" | "complete";
    title?: string;
    url?: string | string[];
    windowId?: number;
    windowType?: "normal" | "popup" | "panel" | "app";
    incognito?: boolean;
  }

  function query(queryInfo: TabQueryInfo): Promise<Tab[]>;
  function create(createProperties: {
    windowId?: number;
    index?: number;
    url?: string;
    active?: boolean;
    selected?: boolean;
    pinned?: boolean;
    openerTabId?: number;
  }): Promise<Tab>;
  function update(tabId: number, updateProperties: {
    url?: string;
    active?: boolean;
    highlighted?: boolean;
    pinned?: boolean;
    openerTabId?: number;
    autoDiscardable?: boolean;
    discarded?: boolean;
  }): Promise<Tab>;
  function remove(tabIds: number | number[]): Promise<void>;
  function sendMessage(tabId: number, message: unknown, options?: {
    frameId?: number;
  }): Promise<unknown>;
}

// Type definitions for the chrome.alarms API
declare namespace chrome.alarms {
  interface Alarm {
    name: string;
    scheduledTime: number;
    periodInMinutes?: number;
  }

  function create(
    name: string,
    alarmInfo: {
      delayInMinutes?: number;
      periodInMinutes?: number;
      when?: number;
    }
  ): void;

  function get(name: string, callback: (alarm: Alarm | undefined) => void): void;
  function getAll(callback: (alarms: Alarm[]) => void): void;
  function clear(name: string, callback?: (wasCleared: boolean) => void): void;
  function clearAll(callback?: (wasCleared: boolean) => void): void;

  const onAlarm: {
    addListener(callback: (alarm: Alarm) => void): void;
    removeListener(callback: (alarm: Alarm) => void): void;
  };
}

// Type definitions for the chrome.notifications API
declare namespace chrome.notifications {
  interface NotificationOptions {
    type: "basic" | "image" | "list" | "progress";
    iconUrl?: string;
    appIconMaskUrl?: string;
    title: string;
    message: string;
    priority?: number;
    eventTime?: number;
    buttons?: Array<{
      title: string;
      iconUrl?: string;
    }>;
    items?: Array<{
      title: string;
      message: string;
    }>;
    progress?: number;
    isClickable?: boolean;
  }

  function create(
    id: string,
    options: NotificationOptions,
    callback?: () => void
  ): void;

  function update(
    id: string,
    options: NotificationOptions,
    callback?: (wasUpdated: boolean) => void
  ): void;

  function clear(id: string, callback?: (wasCleared: boolean) => void): void;
  function getAll(callback: (notifications: Record<string, NotificationOptions>) => void): void;

  const onClicked: {
    addListener(callback: (notificationId: string) => void): void;
    removeListener(callback: (notificationId: string) => void): void;
  };

  const onClosed: {
    addListener(callback: (notificationId: string, byUser: boolean) => void): void;
    removeListener(callback: (notificationId: string, byUser: boolean) => void): void;
  };

  const onButtonClicked: {
    addListener(callback: (notificationId: string, buttonIndex: number) => void): void;
    removeListener(callback: (notificationId: string, buttonIndex: number) => void): void;
  };
}

// Type definitions for the chrome.storage API
declare namespace chrome.storage {
  interface StorageArea {
    get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
    clear(): Promise<void>;
  }

  interface StorageChange {
    oldValue?: unknown;
    newValue?: unknown;
  }

  interface StorageAreaSync {
    get(keys?: string | string[] | Record<string, unknown>): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
    clear(): Promise<void>;
    onChanged: {
      addListener(callback: (changes: Record<string, StorageChange>) => void): void;
      removeListener(callback: (changes: Record<string, StorageChange>) => void): void;
    };
  }

  const local: StorageArea;
  const sync: StorageAreaSync;
  const managed: StorageArea;
}

// Type definitions for the chrome.downloads API
declare namespace chrome.downloads {
  interface DownloadItem {
    id: number;
    url: string;
    filename: string;
    fileSize?: number;
    startTime: string;
    endTime?: string;
    state: "in_progress" | "interrupted" | "complete";
    paused?: boolean;
    error?: string;
    totalBytes?: number;
    bytesReceived: number;
    exists?: boolean;
    mimeType?: string;
    incognito?: boolean;
  }

  interface DownloadDelta {
    id: number;
    url?: { current: string; previous: string };
    filename?: { current: string; previous: string };
    fileSize?: { current: number; previous: number };
    startTime?: { current: string; previous: string };
    endTime?: { current: string; previous: string };
    state?: { current: string; previous: string };
    paused?: { current: boolean; previous: boolean };
    error?: { current: string; previous: string };
    totalBytes?: { current: number; previous: number };
    bytesReceived?: { current: number; previous: number };
    exists?: { current: boolean; previous: boolean };
  }

  interface DownloadOptions {
    url: string;
    filename?: string;
    saveAs?: boolean;
    method?: "GET" | "POST";
    headers?: Array<{ name: string; value: string | unknown }>;
    body?: string;
    conflictAction?: "uniquify" | "overwrite" | "prompt";
    startTime?: string;
    forcedFileType?: boolean;
    matchActiveContentOnly?: boolean;
    secureDirectory?: boolean;
  }

  function download(options: chrome.downloads.DownloadOptions): Promise<number>;

  function cancel(downloadId: number): Promise<void>;
  function pause(downloadId: number): Promise<void>;
  function resume(downloadId: number): Promise<void>;
  function removeFile(downloadId: number): Promise<void>;
  function erase(query: {
    startedBefore?: string;
    startedAfter?: string;
    endedBefore?: string;
    endedAfter?: string;
    urlRegex?: string;
    filenameRegex?: string;
    mimeType?: string;
    state?: "in_progress" | "interrupted" | "complete";
    danger?: string;
    paused?: boolean;
    error?: string;
    bytesReceivedMin?: number;
    bytesReceivedMax?: number;
    limit?: number;
    orderBy?: string[];
  }): Promise<number[]>;

  function show(downloadId: number): Promise<boolean>;
  function open(downloadId: number): Promise<void>;
  function showFolder(downloadId: number): Promise<void>;

  const onCreated: {
    addListener(callback: (downloadItem: DownloadItem) => void): void;
    removeListener(callback: (downloadItem: DownloadItem) => void): void;
  };

  const onErased: {
    addListener(callback: (downloadId: number) => void): void;
    removeListener(callback: (downloadId: number) => void): void;
  };

  const onChanged: {
    addListener(callback: (downloadDelta: DownloadDelta) => void): void;
    removeListener(callback: (downloadDelta: DownloadDelta) => void): void;
  };

  const onCreated: {
    addListener(callback: (downloadItem: DownloadItem) => void): void;
    removeListener(callback: (downloadItem: DownloadItem) => void): void;
  };

  const onErased: {
    addListener(callback: (downloadId: number) => void): void;
    removeListener(callback: (downloadId: number) => void): void;
  };

  const onCompleted: {
    addListener(callback: (downloadItem: DownloadItem) => void): void;
    removeListener(callback: (downloadItem: DownloadItem) => void): void;
  };

  const onError: {
    addListener(callback: (downloadItem: DownloadItem) => void): void;
    removeListener(callback: (downloadItem: DownloadItem) => void): void;
  };
}

// Type definitions for the chrome.scripting API
declare namespace chrome.scripting {
  interface InjectionTarget {
    tabId: number;
    frameIds?: number[];
    allFrames?: boolean;
  }

  interface InjectionResult {
    frameId: number;
    result?: unknown;
  }

  interface ExecuteScriptOptions {
    target: InjectionTarget;
    func?: ((...args: unknown[]) => unknown) | string;
    args?: unknown[];
    files?: string[];
    world?: "ISOLATED" | "MAIN";
  }

  function executeScript(options: ExecuteScriptOptions): Promise<InjectionResult[]>;

  function insertCSS(options: {
    target: InjectionTarget;
    css?: string;
    files?: string[];
  }): Promise<void>;

  function removeCSS(options: {
    target: InjectionTarget;
    css?: string;
    files?: string[];
  }): Promise<void>;
}

// Type definitions for the chrome.contextMenus API
declare namespace chrome.contextMenus {
  interface OnClickData {
    menuItemId: string | number;
    parentMenuItemId?: string | number;
    mediaType?: string;
    linkUrl?: string;
    srcUrl?: string;
    pageUrl?: string;
    frameId?: number;
    selectionText?: string;
    editable?: boolean;
  }

  function create(createProperties: {
    id?: string;
    type?: "normal" | "checkbox" | "radio" | "separator";
    title?: string;
    contexts?: string[];
    onclick?: (info: OnClickData, tab?: chrome.tabs.Tab) => void;
    parentId?: string | number;
    documentUrlPatterns?: string[];
    targetUrlPatterns?: string[];
    enabled?: boolean;
  }): string | number;

  function update(id: string | number, updateProperties: {
    title?: string;
    contexts?: string[];
    onclick?: (info: OnClickData, tab?: chrome.tabs.Tab) => void;
    enabled?: boolean;
  }): void;

  function remove(id: string | number): void;
  function removeAll(): void;

  const onClicked: {
    addListener(callback: (info: OnClickData, tab?: chrome.tabs.Tab) => void): void;
    removeListener(callback: (info: OnClickData, tab?: chrome.tabs.Tab) => void): void;
  };
}
