export const GM_TYPES = `
declare namespace GM {
    interface Response<TContext> {
        readonly responseHeaders: string;
        readonly responseText: string;
        readonly status: number;
        readonly statusText: string;
        readonly readyState: number;
        readonly finalUrl: string;
        readonly response: any;
        readonly context?: TContext;
    }

    interface Request<TContext = any> {
        method?: "GET" | "HEAD" | "POST";
        url: string;
        headers?: { [key: string]: string };
        data?: string;
        binary?: boolean;
        timeout?: number;
        context?: TContext;
        responseType?: "arraybuffer" | "blob" | "json";
        onabort? (response: Response<TContext>): void;
        onerror? (response: Response<TContext>): void;
        onload? (response: Response<TContext>): void;
        onprogress? (response: Response<TContext>): void;
        onreadystatechange? (response: Response<TContext>): void;
        ontimeout? (response: Response<TContext>): void;
    }

    function xmlHttpRequest<TContext = any>(details: Request<TContext>): { abort(): void };
    function setValue(key: string, value: any): Promise<void>;
    function getValue(key: string, defaultValue?: any): Promise<any>;
    function deleteValue(key: string): Promise<void>;
    function listValues(): Promise<string[]>;
    function addStyle(css: string): void;
    function getResourceUrl(name: string): Promise<string>;
    function notification(details: { text: string, title?: string, image?: string, highlight?: boolean, silent?: boolean, timeout?: number, onclick?: () => void, ondone?: () => void }): void;
    function openInTab(url: string, options?: { active?: boolean, insert?: boolean, setParent?: boolean }): void;
    function setClipboard(data: string, info?: string | { type?: string, minibar?: boolean }): void;
    
    const info: {
        script: {
            author: string;
            description: string;
            excludes: string[];
            includes: string[];
            matches: string[];
            name: string;
            namespace: string;
            resources: { name: string, url: string }[];
            runAt: string;
            version: string;
        };
        scriptHandler: string;
        version: string;
    };
}

declare function GM_xmlhttpRequest<TContext = any>(details: GM.Request<TContext>): { abort(): void };
declare function GM_setValue(key: string, value: any): void;
declare function GM_getValue(key: string, defaultValue?: any): any;
declare function GM_deleteValue(key: string): void;
declare function GM_listValues(): string[];
declare function GM_addStyle(css: string): void;
declare function GM_getResourceText(name: string): string;
declare function GM_getResourceURL(name: string): string;
declare function GM_log(message: any): void;
declare function GM_notification(details: { text: string, title?: string, image?: string, highlight?: boolean, silent?: boolean, timeout?: number, onclick?: () => void, ondone?: () => void }): void;
declare function GM_openInTab(url: string, options?: { active?: boolean, insert?: boolean, setParent?: boolean }): void;
declare function GM_registerMenuCommand(caption: string, onClick: () => void, accessKey?: string): string;
declare function GM_unregisterMenuCommand(id: string): void;

declare const unsafeWindow: Window;
`;
