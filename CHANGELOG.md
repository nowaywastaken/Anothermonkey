# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project setup with Plasmo framework
- Core user script management infrastructure
- Chrome Manifest V3 native support via chrome.userScripts API
- Script installation dialog with permission review
- Monaco Editor integration with syntax highlighting and GM API types
- Script list component with search and filtering
- Bulk operations (enable, disable, delete, export)
- Dark mode support with system preference detection
- Cloud sync via Google Drive API
- Script statistics tracking (run count, errors)
- Automatic update checking with configurable intervals
- URL matching support for Chrome patterns, regex, and globs
- Dependency management (@require, @resource)
- Script injection into existing tabs
- Permission management with @connect domain whitelist
- GM API implementation (xmlhttpRequest, storage, notification, etc.)
- Cookie management via GM_cookie
- Menu command registration
- Toast notification system
- Popup with script status and quick actions
- Options page with full script management
- Content script to intercept .user.js file installations
- Logger system with different log levels
- IndexedDB database with Dexie

### Changed

- N/A

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- Fixed run-at metadata parsing (document-start → document_start)
- Fixed type annotations in parser.ts

### Security

- Each script runs in isolated JavaScript world
- @connect domain whitelist enforcement
- Strict Content Security Policy
- Secure cookie storage
- Permission verification for all GM API calls

---

## [0.0.1] - 2026-01-31

### Added

- Initial release of AnotherMonkey
- Basic userscript management functionality
- MV3 support with chrome.userScripts API
- Core GM APIs implemented

---

## Version Format

- **[Unreleased]**: Changes planned or in progress
- **[X.Y.Z]**: Released versions

## Change Types

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security vulnerabilities or improvements
