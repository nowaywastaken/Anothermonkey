# AnotherMonkey - Next-Gen Userscript Manager (MV3)

AnotherMonkey is a modern userscript manager built from the ground up for **Manifest V3**. It replicates the core functionality of Tampermonkey while adhering to the latest browser security and performance standards.

## Key Features

- **Manifest V3 Native**: Uses the `chrome.userScripts` API for secure and efficient script injection.
- **Robust Metadata Engine**: Parses standard Userscript metadata blocks, supporting `@match`, `@include`, `@grant`, `@require`, `@resource`, and more.
- **Complete GM_* API Support**:
  - **Synchronous Storage**: High-performance synchronous `GM_getValue`/`GM_setValue` via pre-fetching.
  - **Cross-Origin Requests**: Proxy-based `GM_xmlhttpRequest` bypassing CORS restrictions securely.
  - **Resource Management**: Local caching of `@require` libraries and `@resource` assets.
  - **Menu Commands**: Integration with the extension popup for custom script actions.
- **Developer-Focused Dashboard**: Built with React and Monaco Editor for a premium script management experience.
- **IndexedDB Persistence**: High-capacity storage using Dexie.js for thousands of scripts and large datasets.

## Architecture

- **Execution World**: Scripts run in the `USER_SCRIPT` world, providing isolation from webpage JS while maintaining DOM access.
- **Proxy Communication**: API calls are proxied through a Service Worker to bridge the gap between isolated script environments and privileged extension APIs.
- **Immediate Injection Fallback**: Uses `chrome.scripting` to ensure scripts are active immediately upon enablement, even on already open tabs.

## Tech Stack

- **Framework**: [Plasmo](https://www.plasmo.com/) (The Browser Extension Framework)
- **UI**: React + Tailwind CSS + Lucide Icons
- **Editor**: Monaco Editor
- **Database**: Dexie.js (IndexedDB)

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```