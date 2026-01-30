# AnotherMonkey - Next-Gen Userscript Manager (MV3)

## Executive Summary

As browser extension ecosystems undergo mandatory migration from Manifest V2 (MV2) to Manifest V3 (MV3), userscript managers—a special category of software—face unprecedented architectural restructuring challenges. As the benchmark in this field, Tampermonkey's core value lies in providing users with a runtime environment capable of injecting, executing, and managing arbitrary JavaScript code, while empowering these scripts with capabilities beyond ordinary webpage permissions (such as cross-origin requests and persistent storage) through the `GM_*` API. In the MV3 era, traditional Background Pages have been replaced by ephemeral Service Workers, and dynamic code execution (`eval`) faces strict restrictions, requiring developers to adopt entirely new technology stacks to achieve 1:1 feature replication.

This report aims to provide a comprehensive, expert-level technical blueprint explaining how to build a fully functional Tampermonkey alternative using the latest browser APIs (particularly `chrome.userScripts`) and modern development frameworks (such as Plasmo). The report will delve into core technical details ranging from metadata parsing, script injection mechanisms, and sandbox isolation environments, to implementing `GM_xmlhttpRequest` proxies based on message passing, and combined with IndexedDB high-capacity storage and React-driven UI interaction design, demonstrate how to maximize the restoration of userscript capabilities while meeting security compliance requirements.

------

## Chapter 1: The Evolution of Userscript Managers and Manifest V3's Architectural Challenges

The essence of a userscript manager is a "browser on top of a browser." It is responsible not only for code injection but more importantly for managing script lifecycles, permission boundaries, and interactions with host webpages. To replicate Tampermonkey, one must first deeply understand its positioning changes within browser architecture evolution.

### 1.1 From Greasemonkey to Tampermonkey: A Historical Technology Stack Review

In the MV2 era, Tampermonkey's operational model was relatively straightforward. Extensions had a persistent Background Page that could respond to Content Script requests at any time. Script injection was typically achieved by dynamically creating `<script>` tags in content scripts or directly using `eval()`. The implementation of `GM_*` APIs relied on exposing privileged functions to the page context or communicating with content scripts through `window.postMessage`.

However, this model had two main problems: first, security—dynamically executing Remotely Hosted Code could easily become a breeding ground for malware; second, performance—persistent background pages consumed significant memory resources. The introduction of MV3 was designed to address these issues, but it also dealt a devastating blow to userscript managers:

1. **Prohibition of Remote Code Execution**: Extensions can no longer directly download and `eval` string-form code, meaning traditional script update and execution logic must change.
2. **Service Worker Transience**: Background services no longer persist, making the implementation of APIs based on long connections (such as `GM_download` for monitoring large file download progress) extremely complex.
3. **Network Request Interception Limitations**: The blocking capability of the `webRequest` API has been significantly weakened. While this impacts ad blockers more, it also affects userscripts' fine-grained control over network requests.

### 1.2 The New Paradigm Under Manifest V3: The `chrome.userScripts` API

To continue the vitality of userscripts under MV3 restrictions, the Chrome team (and the W3C WebExtensions Community Group) introduced the `chrome.userScripts` API. This is the cornerstone for replicating Tampermonkey. Unlike the traditional `chrome.scripting` API, the `userScripts` API allows extensions to register source code and metadata, with the browser engine injecting them into pages at specific times (such as `document_start`), without the extension handling injection logic itself.

This API introduces the concept of the "User Script World." This is a third execution environment between the "Main World" (the webpage JS runtime environment) and the "Isolated World" (the extension content script runtime environment).

- **Isolation**: The user script world can access the DOM but cannot directly access Main World JavaScript variables (unless explicitly configured), protecting scripts from reverse prototype chain attacks by webpages.
- **Privileged Access**: While it cannot directly call most `chrome.*` APIs, it can be configured to have a specific CSP (Content Security Policy), allowing `eval` execution (if needed for legacy script compatibility), and communicating with the extension background through specific message channels.

### 1.3 Architecture Restructuring Blueprint

Based on the above analysis, a modernized Tampermonkey replica should include the following four core architectural pillars:

| **Architecture Component** | **MV2 Implementation**                        | **MV3 Replica Implementation**                        |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| **Script Injection**       | Content Script + `eval()` / `<script>`        | `chrome.userScripts.register()`                       |
| **API Bridging**           | `window.postMessage` / Direct object exposure | Custom message events + Service Worker proxy          |
| **Background Processing**  | Persistent Background Page                    | Ephemeral Service Worker + Session Storage            |
| **Data Storage**           | `localStorage` / WebSQL                       | [`chrome.storage`](http://chrome.storage) + IndexedDB |
| **UI Rendering**           | HTML injection / iframe                       | Shadow DOM + React (Plasmo CSUI)                      |

This report will detail the technical implementation of each component around this new architecture.

------

## Chapter 2: Development Framework Selection and Engineering Practices

Replicating Tampermonkey is a massive engineering project involving complex build processes, multi-platform adaptation (Chrome/Firefox/Edge), and deep dependencies on TypeScript and React. Choosing the right development framework is key to project success.

### 2.1 Framework Evaluation: Plasmo vs. WXT vs. Boilerplate

In the 2025 browser extension development ecosystem, Plasmo and WXT are the two dominant frameworks. For logic-heavy, state-management-intensive applications like userscript managers, Plasmo demonstrates significant advantages.

### 2.1.1 Core Advantages of Plasmo

Plasmo is called "the Next.js of browser extensions," solving many MV3 development pain points through a highly integrated toolchain.

- **Automatic Manifest Generation**: Developers don't need to manually maintain a massive `manifest.json`. Plasmo automatically generates permission declarations and entry configurations based on exports and configuration files in the source code. This is crucial for projects that frequently adjust `permissions` (such as `userScripts`, `unlimitedStorage`).
- **Content Script UI (CSUI)**: Userscript managers need to inject UI into webpages (e.g., script installation dialogs, menu command panels). Plasmo provides the ability to mount React components directly into webpage Shadow DOMs, ensuring the manager's UI styles are not polluted by host webpage CSS, achieving perfect style isolation.
- **Messaging API Abstraction**: The implementation of `GM_xmlhttpRequest` relies on extensive cross-context communication. Plasmo's `@plasmohq/messaging` library encapsulates the underlying `chrome.runtime.sendMessage`, providing type-safe end-to-end communication mechanisms, greatly reducing proxy service development complexity.

### 2.1.2 Comparison with WXT and Traditional Templates

WXT is based on Vite, providing excellent build speed and multi-framework support (Vue/Svelte). However, Plasmo's first-class React support and built-in Storage Hooks (for syncing `GM_setValue` data to UI components) make it more efficient when building complex dashboards like Tampermonkey's. Traditional Boilerplates offer maximum flexibility but require developers to manually handle HMR (Hot Module Replacement), build optimization, and multi-browser adaptation, resulting in excessive maintenance costs.

### 2.2 Project Structure and Permission Configuration

The project structure based on Plasmo is designed as follows, aiming to clearly separate UI layer, logic layer, and injection layer:

my-tampermonkey-clone/ ├── assets/ # Icons and static resources ├── src/ │ ├── background/ │ │ ├── index.ts # Service Worker entry │ │ └── messages/ # API proxy handlers (handling GM_xmlhttpRequest, etc.) │ ├── contents/ # Content scripts (for detecting .user.js installation requests) │ ├── components/ # React UI components (editor, list items) │ ├── lib/ │ │ ├── sandbox/ # Userscript sandbox execution logic │ │ ├── store.ts # IndexedDB-based script storage │ │ └── parser.ts # Metadata parsing engine │ ├── popup.tsx # Extension bar popup menu │ ├── options.tsx # Full-screen management dashboard │ └── sandbox.tsx # Actually the userScripts API injection logic configuration ├── package.json # Dependency management and Manifest override configuration └── tsconfig.json # TypeScript configuration Source:

### 2.2.1 Key Permission Declarations

In `package.json`, the default configuration must be overridden through the `manifest` field to request MV3 core permissions:

JSON

```
"manifest": {
  "permissions":,
  "host_permissions": [
    "<all_urls>"            // Required: Allow scripts to run on any website
  ],
  "web_accessible_resources": [
    {
      "resources": ["assets/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

Source:

`unlimitedStorage` is particularly emphasized here because although IndexedDB has a relatively large default capacity, as an extension, users may install hundreds of scripts, and some scripts contain large resource files (introduced via `@resource`), so removing the 5MB `local` storage limit is essential.

------

## Chapter 3: Core Building—Script Metadata Parsing Engine

Tampermonkey's core logic is driven by the metadata block in script headers. This block defines the script's name, version, run targets (`@match`), permission requirements (`@grant`), and dependent resources. Building a high-precision metadata parsing engine is the first step in replication work.

### 3.1 Metadata Block Standard Specifications and Parsing Logic

A standard metadata block looks like this:

JavaScript

```
// ==UserScript==
// @name         My Advanced Script
// @namespace    <http://tampermonkey.net/>
// @version      1.0.5
// @description  Automates tasks on Example.com
// @author       Developer X
// @match        <https://www.example.com/*>
// @include      /^https?:\\/\\/.*\\.example\\.org\\/.*$/
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @require      <https://code.jquery.com/jquery-3.6.0.min.js>
// @resource     logo <https://www.example.com/logo.png>
// @run-at       document-start
// ==/UserScript==
```

Source:

The parsing engine must be robust, capable of handling various non-standard formats (such as extra spaces, different comment forms). Libraries like `userscript-metadata` are available in Node.js environments, but on the browser side (especially when users paste code into the editor), we need an efficient pure JS implementation.

### 3.1.1 Parsing Algorithm Implementation

The parsing process typically consists of the following steps:

1. **Block Extraction**: Use regular expressions to extract content between `// ==UserScript==` and `// ==/UserScript==`. Be careful to handle BOM (Byte Order Mark) headers, which are a hidden cause of many script parsing failures.
2. **Line-by-Line Traversal**: Split content by newline characters and analyze line by line.
3. **Key-Value Matching**: Apply the regex `^\\s*\\/\\/\\s*@([\\w:-]+)(?:\\s+(.*))?$` to each line.
   - **Group 1** is the Key, such as `name` or `run-at`. Note that some keys support multilingual suffixes, like `@name:zh-CN`, and the parser needs to categorize them under the same logical property.
   - **Group 2** is the Value. If empty, treat it as a boolean flag (like `@noframes`).
4. **Aggregation Processing**:
   - **Single-value properties** (`name`, `version`, `run-at`): Later occurrences override earlier ones.
   - **Multi-value properties** (`match`, `exclude`, `grant`, `require`): All occurring values should be collected into an array.

### 3.2 Complex Matching Rule Handling: `@match` vs. `@include`

One of the most troublesome parts of replicating Tampermonkey is maintaining compatibility with legacy matching rules.

- **`@match`**: This is Chrome extension's standard matching pattern with strict syntax (e.g., `://*.[google.com/*](<http://google.com/*>)`). The `chrome.userScripts` API natively supports this attribute, so it can be passed directly to the browser.
- **`@include`**: This is historical baggage supporting Glob patterns and even regular expressions (e.g., `/^https?:\\/\\/.*\\.google\\.com\\/.*$/`). The `chrome.userScripts` API does not directly support regex-type `@include`.
  - **Solution**: If a script uses regex `@include`, the manager must register that script to run on `<all_urls>`, then run a "pre-check code" segment at the earliest stage after script injection (`document_start`) within the user script world. This code uses JavaScript's `RegExp` object to match against `window.location.href`. If matching fails, subsequent script execution is immediately terminated. While this sacrifices some performance, it's the only way to 100% maintain compatibility with old scripts.

### 3.3 Dependency Management: `@require` and `@resource`

Userscripts frequently depend on external libraries (like jQuery) or resources (like images, CSS).

- **Download and Cache**: When users install scripts, the manager must parse `@require` and `@resource` URLs and initiate network requests to download them locally.
- **Storage**: Downloaded content should be stored in [`chrome.storage](<http://chrome.storage>).local` or IndexedDB, associated with the script ID.
- **Injection Mechanism**: Before executing the main script, the manager must concatenate all `@require` library code before the main script, or inject them as separate script blocks before the main script, ensuring dependencies are ready when the main script runs.

------

## Chapter 4: Runtime Environment—Injection Mechanism Based on `chrome.userScripts`

This is the most changed part under MV3 architecture. We no longer manipulate DOM to inject `<script>` tags ourselves, but configure the browser's native injector.

### 4.1 Deep Application of `chrome.userScripts.register`

`chrome.userScripts.register` accepts an array of objects, each representing an installed script configuration.

TypeScript

```
interface RegisteredUserScript {
  id: string;               // Unique identifier
  js: ScriptSource;       // Script code (including @require and main logic)
  matches: string;        // @match rules
  excludeMatches?: string;// @exclude rules
  runAt?: RunAt;            // document_start, document_end, document_idle
  world?: ExecutionWorld;   // "USER_SCRIPT" or "MAIN"
}
```

Source:

### 4.1.1 Dynamic Registration Strategy

Since `register` is persistent, the manager doesn't need to re-register on every browser startup. However, when users "enable/disable" or "edit" scripts in the dashboard, `chrome.userScripts.update` must be called, or `unregister` followed by `register` to update the browser's internal registry in real-time.

### 4.2 Execution World Selection and Isolation

MV3 introduced the `ExecutionWorld` enum, which is crucial for security.

- **`USER_SCRIPT` World**: This is the default and recommended option. It provides an isolated JS context with its own global object (`window`). This means variables defined by scripts won't pollute webpages, and vice versa. However, it can access webpage content through the DOM. This is the soil where `GM_*` APIs can safely survive—we can inject the `GM_xmlhttpRequest` function in this world without worrying about malicious code on the webpage rewriting it to steal user Cookies.
- **`MAIN` World**: Some scripts need direct access to webpage JavaScript variables (e.g., calling webpage-defined `ShowMessage()` functions or hijacking `window.XMLHttpRequest`). For scripts declaring `@grant none` or explicitly requiring access to `unsafeWindow`, we need to consider injecting them into the MAIN world, or interacting through `unsafeWindow` (a reference to the main world) in the USER_SCRIPT world. Note that MV3 has more restrictions on MAIN world injection, which may require using the `chrome.scripting` API.

### 4.3 Challenges of Immediate Injection

`chrome.userScripts.register` only takes effect for tabs opened **in the future**. If a user installs and enables a script on an already-open tab, the script won't run automatically.

To replicate Tampermonkey's experience (instant usability), we need to implement an "immediate injection" fallback mechanism.

- **Solution**: Use `chrome.scripting.executeScript`.
- **Logic**: When a script is enabled, the manager queries all currently active tabs matching the script's `@match` rules and manually calls `executeScript` to inject the code. Note that scripts injected this way run in the `ISOLATED` world (similar to Content Scripts), whose environment may differ slightly from the `USER_SCRIPT` world, so this is only a compatibility workaround.

------

## Chapter 5: API Bridging—Complete Implementation of `GM_*` Functions

This is the most technically challenging part of the entire project. `GM_*` functions give ordinary JavaScript scripts "superpowers," and under MV3's sandbox mechanism, these capabilities must be implemented through a Proxy pattern.

### 5.1 Communication Architecture: Proxy Model Based on Message Bus

Since userscripts run in the `USER_SCRIPT` world, they don't have permission to directly access most extension APIs beyond `chrome.runtime`, nor can they make cross-origin requests (constrained by page CORS). Therefore, all `GM_` function calls are essentially RPC (Remote Procedure Calls).

**Call Chain:**

1. **Userscript Call**: `GM_xmlhttpRequest({ url: '...' })`
2. **API Injection Layer (Frontend)**: Serialize parameters, generate a unique `requestId`, and send to the background via `chrome.runtime.sendMessage`.
3. **Service Worker (Backend)**: Receive message, execute actual `fetch` request or storage operation.
4. **Callback Return**: Service Worker sends results (status code, response body) back to frontend.
5. **Frontend Distribution**: Find the corresponding callback function (`onload`) based on `requestId`, execute user logic.

### 5.2 Core Difficulty: Deep Replication of `GM_xmlhttpRequest`

`GM_xmlhttpRequest` is the most commonly used API for cross-origin data fetching. In MV3, the `XMLHttpRequest` object is unavailable in Service Workers, requiring the `fetch` API as a replacement. But `fetch` and `XHR` have behavioral differences requiring extremely meticulous encapsulation.

### 5.2.1 Binary Data and Streaming Processing

Userscripts frequently request images or large files (`responseType: 'blob'` or `'arraybuffer'`). Chrome's message passing channel can only transmit JSON-compatible data.

- **Solution**:
  - **Sender (Service Worker)**: When `fetch` receives binary data, it must be converted to a Base64 string or read as a text stream via `FileReader`, then sent through messages.
  - **Receiver (API Injector)**: After receiving Base64, convert it back to `Uint8Array` or `Blob`, then pass to the userscript.
  - **Streaming (onprogress)**: For large files, you can't wait for download completion before sending all at once. Must use long connections (`chrome.runtime.connect`), utilizing `port.postMessage` to transmit data in chunks, simulating the `onprogress` event.

### 5.2.2 Cookies and Anonymous Requests

`GM_xmlhttpRequest` supports the `anonymous: true/false` option.

- **Default Behavior (anonymous: false)**: Requests should carry the browser's current Cookies for the target domain. Service Worker's `fetch` doesn't include Cookies by default; `credentials: 'include'` must be set.
- **Anonymous Behavior**: Set `credentials: 'omit'`.
- **Header Control**: Userscripts may set `Referer` or `User-Agent`. Service Workers need to use `declarativeNetRequest` or modify `fetch`'s headers configuration to meet these needs, but browsers have strict restrictions on certain Headers (like `Host`).

### 5.3 Storage API: `GM_setValue` / `GM_getValue`

### 5.3.1 Synchronous vs. Asynchronous Contradiction

Tampermonkey's `GM_getValue` was traditionally synchronous (returning results directly). However, the [`chrome.storage`](http://chrome.storage) API is asynchronous.

- **Strategy**: To maintain compatibility with old scripts, we must make trade-offs between modern APIs (`GM.getValue`, returning Promises) and old APIs.
  - **Recommended Approach**: Fully promote `GM.getValue` (async version).
  - **Compatibility Approach**: If synchronous support is required, the only option is during early script loading (`document_start`), the manager pre-fetches all data for that script from storage and caches it in a memory object within the `USER_SCRIPT` world. Subsequent synchronous reads by the script actually read from the memory cache. Write operations first update memory, then asynchronously write back to [`chrome.storage`](http://chrome.storage).

### 5.3.2 Storage Medium Selection

Considering users may store large amounts of data (like cached page content), [`chrome.storage](<http://chrome.storage>).local`'s 5MB limit (even with `unlimitedStorage` permission, read/write performance is a bottleneck) may be insufficient.

- **Advanced Approach**: Use IndexedDB. Operate IndexedDB in Service Workers through libraries like `idb`. Since IndexedDB supports direct storage of binary objects (Blobs), this is much more efficient than [`chrome.storage`](http://chrome.storage) for storing images and other resources.

### 5.4 Menu Commands: `GM_registerMenuCommand`

This API allows scripts to add custom buttons in the extension's popup menu.

- **Implementation**: The frontend sends command names and callback IDs to the background. When users click menu items in the Popup, the Popup notifies the background, which then notifies the corresponding tab's API Injector via `chrome.tabs.sendMessage`, ultimately triggering the callback. This requires maintaining a dynamic "Tab ID -> Command List" mapping table.

------

## Chapter 6: Security Model and Sandbox Isolation

As a platform that allows arbitrary code execution, security is an absolute red line.

### 6.1 `@connect` Domain Whitelist Mechanism

To prevent malicious scripts from arbitrarily initiating network requests to steal data, Tampermonkey introduced the `@connect` mechanism.

- **Implementation**: In the Service Worker's `GM_xmlhttpRequest` proxy logic, a validation step must be added. Before initiating `fetch`, parse the target URL and compare it against the `@connect` list (and the `@match` list) in the script metadata.
- **User Interaction**: If the requested domain is not on the whitelist, the manager should intercept the request and pop up a notification or dialog asking: "Script X is trying to access [api.evil.com](http://api.evil.com). Do you want to allow this?" Only after user authorization should the domain be added to the dynamic whitelist.

### 6.2 Content Security Policy (CSP) Bypass and Reconstruction

A webpage's CSP may prohibit `eval` or loading external scripts. `chrome.userScripts.configureWorld` provides powerful capabilities to rewrite this rule.

- **Configuration**:

  JavaScript

  ```
  chrome.userScripts.configureWorld({
    csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; object-src 'none'",
    messaging: true
  });
  ```

  This configuration applies only to the user script world and does not reduce the security of the main webpage. This allows userscripts to use `eval` for dynamic logic generation without worrying about being blocked by the page's CSP.

### 6.3 Inter-Script Isolation

Do different userscripts run in the same `USER_SCRIPT` world?

- **MV3 Improvement**: The latest `userScripts` API allows specifying independent execution worlds for each script (or script group) through the `worldId` parameter.
- **Best Practice**: To prevent Script A from modifying global variables and affecting Script B, it's recommended to generate a unique `worldId` for each script (e.g., based on script UUID). This way, each script has a completely independent `window` object, completely eliminating conflicts and malicious interference between scripts.

------

## Chapter 7: UI/UX Implementation—Building a Modern Dashboard

Using Plasmo and React to build the UI can provide a smoother experience than older versions of Tampermonkey.

### 7.1 Dashboard Construction

The dashboard is the core for users to manage scripts.

- **Code Editor Integration**: Integrate `Monaco Editor` (VS Code's core). While it's relatively large, it provides irreplaceable syntax highlighting, intelligent suggestions, and error checking. To reduce extension package size, lazy loading strategies should be employed to load editor components.
- **State Management**: Since the number of scripts can be large, it's recommended to use React Query or SWR to manage data flow from IndexedDB to UI for the script list, ensuring rendering performance and data consistency.

### 7.2 Script Installation Flow Interception

When users visit links with `.user.js` suffixes, browsers by default download them as text files or display them.

- **Interception Strategy**:
  1. **Content Script Detection**: Inject a lightweight Content Script on all pages. When detecting `document.contentType` is `text/javascript` and the URL ends with `.user.js`, extract page content.
  2. **Redirect**: Prevent default display, send message to Service Worker.
  3. **Installation Interface**: Service Worker opens a new extension page (installation wizard), passing the extracted code to that page.
  4. **Parsing and Confirmation**: The installation page parses metadata, displays script permissions (e.g., "This script needs to access your Cookies"), and stores in database after user confirmation.

------

## Chapter 8: Data Persistence and Cloud Sync

### 8.1 Storage Architecture Design

- **Metadata Storage**: Use [`chrome.storage](<http://chrome.storage>).local` to store lightweight configuration information (like script toggle status, run counts, last update time).
- **Code Storage**: Use IndexedDB to store script source code. Code is typically large and doesn't require frequent serialization.
- **Value Storage**: `GM_setValue` data should also be stored in a separate IndexedDB ObjectStore, indexed by `script_id` as the primary key, preventing data confusion between different scripts.

### 8.2 Cloud Sync (Theoretical Implementation)

Tampermonkey supports Google Drive / Dropbox sync.

- **Implementation Logic**:
  1. **OAuth Authorization**: Use `chrome.identity.getAuthToken` to obtain the user's Google access token.
  2. **Data Packaging**: Serialize all local scripts and metadata into a JSON object.
  3. **File Upload**: Call Google Drive API to upload the JSON file.
  4. **Conflict Resolution**: When downloading cloud files, compare local modification times. If the cloud version is newer, overwrite local; if there's a conflict, pop up UI for users to manually merge.

------

## Chapter 9: Future Outlook and Maintenance Strategy

Completion of construction is just the first step. Rapid iteration of browser specifications requires developers to stay alert.

### 9.1 Automatic Update Mechanism

Use the `chrome.alarms` API to set periodic tasks (e.g., every 24 hours). When triggered, the Service Worker iterates through all scripts, checking `@updateURL`. If it exists, download header information and compare the `@version` field. If a new version is found, download the full code and update storage.

### 9.2 Cross-Browser Compatibility

Although this report primarily targets Chrome MV3, Firefox's current MV3 support (especially the `userScripts` API) differs slightly (e.g., Firefox's `userScripts` API signature and permission handling differ). A major advantage of using Plasmo is the ability to generate code packages adapted to different browsers through environment variables and platform-specific build configurations (`plasmo build --target=firefox-mv2`).

------

## Conclusion

Replicating Tampermonkey's core functionality in the Manifest V3 era is no longer simple code porting, but an architectural reshaping based on new browser capabilities. By adopting the `chrome.userScripts` API and its accompanying "User Script World" concept, we solve the trickiest code injection and isolation problems; by building a message proxy bus based on Service Workers, we successfully bypass CORS restrictions and restore the powerful `GM_xmlhttpRequest` capability; and leveraging the Plasmo framework and React ecosystem, we can build modern UIs comparable to native applications at lower engineering costs.

Although the technical threshold has significantly increased, the new architecture also brings better security and performance. For developers, mastering this entire technology stack not only means being able to develop powerful userscript managers, but also represents the highest technical standard in modern browser extension development.

------

## Appendix: Technical Implementation Comparison Table and Data Structures

### Table 1: Core API Mapping Strategy

| **Tampermonkey Feature**   | **MV3 Technical Implementation**   | **Key API Dependencies**                  |
| -------------------------- | ---------------------------------- | ----------------------------------------- |
| **Script Execution**       | Register to User Script World      | `chrome.userScripts.register`             |
| **GM_xmlhttpRequest**      | Message Passing + Fetch API        | `runtime.sendMessage` + `fetch`           |
| **GM_setValue**            | IndexedDB Wrapper                  | `idb` library                             |
| **GM_registerMenuCommand** | Message Passing + Context Menu API | `contextMenus` + `tabs.sendMessage`       |
| **unsafeWindow**           | Main World Injection Fallback      | `world: "MAIN"` or `executeScript`        |
| **@include (regex)**       | JS Runtime Regex Check             | `new RegExp(pattern).test(location.href)` |

### Table 2: Metadata Parsing and Storage Structure Example (TypeScript)

TypeScript

```
// Script metadata interface definition
interface ScriptMetadata {
  name: string;
  namespace?: string;
  version: string;
  description?: string;
  matches: string;        // Corresponds to @match
  includes: string;       // Corresponds to @include (Globs/Regex)
  excludes: string;       // Corresponds to @exclude
  grants: string;         // Corresponds to @grant
  runAt: 'document_start' | 'document_end' | 'document_idle';
  resources: Array<{ name: string; url: string; content?: string }>;
  requires: string;       // Dependency library URLs
  updateURL?: string;
}

// Runtime injection configuration object
interface UserScriptInjection {
  id: string;
  js: Array<{ code: string } | { file: string }>;
  world: chrome.userScripts.ExecutionWorld;
  matches: string;
}
```

### Table 3: Development Toolchain Recommendations

| **Tool Category**    | **Recommended Solution** | **Rationale**                                                |
| -------------------- | ------------------------ | ------------------------------------------------------------ |
| **Core Framework**   | **Plasmo**               | Perfect MV3 support, auto Manifest, React integration        |
| **Editor Component** | **Monaco Editor**        | Industry standard, most powerful features, but requires Lazy Load config |
| **Database**         | **Dexie.js**             | Excellent IndexedDB wrapper library, good TypeScript support |
| **UI Library**       | **Radix UI / Tailwind**  | Unstyled components easy to customize, Tailwind high dev efficiency |
| **Metadata Parsing** | **userscript-metadata**  | TypeScript-based parsing library, type-safe                  |

*(Note: All technical inferences and API usage in this report are based on 2025 Chrome Extension documentation and related open-source project source code analysis.)*