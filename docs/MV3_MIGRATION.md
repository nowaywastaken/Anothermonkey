# MV3 迁移指南

## 目录

- [概述](#概述)
- [主要变化](#主要变化)
- [迁移步骤](#迁移步骤)
- [常见问题](#常见问题)
- [最佳实践](#最佳实践)

---

## 概述

Chrome Manifest V3 (MV3) 引入了重要的安全性和架构变更，影响了用户脚本管理器的实现方式。本文档帮助理解从 MV2 到 MV3 的迁移过程。

### 为什么迁移到 MV3？

1. **更好的安全性**: 更严格的权限模型和 CSP
2. **改进的隐私**: 减少对用户数据的潜在访问
3. **原生用户脚本 API**: `chrome.userScripts` 提供官方支持
4. **未来兼容**: Chrome 最终将弃用 MV2

---

## 主要变化

### 1. Service Worker 替代后台页面

#### MV2

```javascript
// background.html (持久化页面)
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});
```

#### MV3

```typescript
// background.ts (Service Worker)
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

// Service Worker 可以被终止和重新启动
// 不能使用 DOM API
// 需要使用 chrome.storage 持久化状态
```

#### 影响

- ❌ 不能使用 `window`, `document` 等 DOM API
- ❌ 不能使用 `setTimeout` / `setInterval` (需要使用 `chrome.alarms`)
- ✅ 更轻量，不常驻内存
- ✅ 支持原生 Promise

### 2. chrome.userScripts API

这是 MV3 最重要的新特性，提供原生的用户脚本支持。

#### MV2 方式

在 MV2 中，需要手动使用 `chrome.tabs.executeScript` 注入脚本：

```javascript
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && matchesUrl(tab.url)) {
    chrome.tabs.executeScript(tabId, {
      code: scriptCode,
    });
  }
});
```

#### MV3 方式

使用 `chrome.userScripts.register` 自动注入：

```typescript
await chrome.userScripts.register([
  {
    id: "my-script",
    matches: ["https://example.com/*"],
    js: [{ code: scriptCode }],
    world: "USER_SCRIPT",
  },
]);
```

#### 优势

- ✅ 自动匹配 URL，无需手动监听
- ✅ 支持独立的 JavaScript 世界
- ✅ 更好的性能和可靠性

#### 限制

- ⚠️ 需要 Chrome 120+
- ⚠️ 需要声明 `userScripts` 权限
- ⚠️ 某些 GM API 需要通过消息传递实现

### 3. Host Permissions

#### MV2

```json
{
  "permissions": ["<all_urls>", "https://*/*", "http://*/*"]
}
```

#### MV3

```json
{
  "permissions": ["userScripts", "storage"],
  "host_permissions": ["<all_urls>"]
}
```

#### 影响

- 权限分离更清晰
- 用户更容易理解扩展的权限
- `<all_urls>` 在 host_permissions 中仍然有效

### 4. Content Security Policy (CSP)

#### MV2

```javascript
// 可以使用 eval() 和 unsafe-eval
const result = eval("2 + 2");
```

#### MV3

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

#### 用户脚本世界的 CSP

```typescript
chrome.userScripts.configureWorld({
  worldId: "script-world",
  messaging: true,
  csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; object-src 'none'",
});
```

### 5. 跨域请求

#### MV2

- 后台页面可以直接发起跨域请求（声明权限后）
- Content Script 需要通过后台页面代理

#### MV3

- Service Worker 可以发起请求
- 仍然需要声明 host_permissions
- `GM_xmlhttpRequest` 仍需要通过后台实现

---

## 迁移步骤

### 步骤 1: 更新 manifest.json

```json
{
  "manifest_version": 3,
  "permissions": [
    "userScripts",
    "storage",
    "unlimitedStorage",
    "tabs",
    "scripting",
    "activeTab",
    "notifications",
    "identity"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/index.js"
  }
}
```

### 步骤 2: 转换后台页面为 Service Worker

```typescript
// background/index.ts

// ❌ 不能使用 DOM
// const el = document.createElement('div')

// ✅ 使用 chrome.storage 持久化状态
async function initialize() {
  const { initialized } = await chrome.storage.local.get("initialized");

  if (!initialized) {
    await chrome.storage.local.set({ initialized: true });
    // 初始化逻辑
  }
}

// ✅ 使用 chrome.alarms 代替 setTimeout
chrome.alarms.create("check_updates", {
  periodInMinutes: 24 * 60,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check_updates") {
    checkForUpdates();
  }
});
```

### 步骤 3: 使用 chrome.userScripts API

```typescript
// 注册脚本
async function registerScript(script: UserScript) {
  await chrome.userScripts.register([
    {
      id: script.id,
      worldId: script.id, // 唯一世界 ID
      matches: script.metadata.matches,
      excludeMatches: script.metadata.excludes,
      js: [{ code: script.code }],
      runAt: script.metadata.runAt,
      world: "USER_SCRIPT", // 或 'MAIN'
    },
  ]);
}

// 更新脚本
async function updateScript(script: UserScript) {
  await chrome.userScripts.update([
    {
      id: script.id,
      // ... 新的配置
    },
  ]);
}

// 注销脚本
async function unregisterScript(scriptId: string) {
  await chrome.userScripts.unregister({ ids: [scriptId] });
}
```

### 步骤 4: 配置用户脚本世界

```typescript
// 配置默认世界
chrome.userScripts.configureWorld({
  messaging: true, // 允许消息传递
  csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; object-src 'none'",
});

// 配置脚本特定的独立世界
async function configureScriptWorlds() {
  const scripts = await db.scripts.toArray();

  for (const script of scripts) {
    try {
      await chrome.userScripts.configureWorld({
        worldId: script.id, // 使用脚本 UUID
        messaging: true,
        csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; object-src 'none'",
      });
    } catch (e) {
      console.error(`Failed to configure world for ${script.id}:`, e);
    }
  }
}
```

### 步骤 5: 更新 GM API 实现

由于 `chrome.userScripts` 不直接提供 GM API，需要注入：

```typescript
const GM_API_CODE = `
(function() {
  // 注入 GM_* 函数
  window.GM_xmlhttpRequest = function(details) {
    // 通过 chrome.runtime.sendMessage 调用后台
    return chrome.runtime.sendMessage({
      action: 'GM_xmlhttpRequest',
      details
    })
  }
  
  // ... 其他 GM API
})();
`;

await chrome.userScripts.register([
  {
    id: script.id,
    js: [
      { code: GM_API_CODE }, // 先注入 GM API
      { code: script.code }, // 再注入脚本
    ],
    // ...
  },
]);
```

### 步骤 6: 测试和验证

1. **基本功能测试**
   - 安装脚本
   - 脚本是否在匹配页面运行
   - GM API 是否正常工作

2. **权限测试**
   - 跨域请求是否被正确拦截
   - @connect 域名白名单是否生效
   - 权限请求流程是否正常

3. **持久化测试**
   - Service Worker 重启后状态是否保持
   - 脚本配置是否正确恢复

---

## 常见问题

### Q1: Service Worker 频繁重启怎么办？

Service Worker 会在以下情况下重启：

- 扩展更新
- 浏览器关闭再打开
- 内存压力
- 闲置一段时间（约 30 秒）

#### 解决方案

使用 `chrome.storage` 持久化状态：

```typescript
// 保存状态
await chrome.storage.local.set({ state: myState });

// 恢复状态
const { state } = await chrome.storage.local.get("state");
```

### Q2: setTimeout / setInterval 不工作？

Service Worker 中这些计时器会被终止。

#### 解决方案

使用 `chrome.alarms`：

```typescript
// 设置单次定时器
chrome.alarms.create("my-alarm", {
  when: Date.now() + 5000,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "my-alarm") {
    // 执行任务
  }
});
```

### Q3: GM_xmlhttpRequest 跨域请求失败？

需要确保：

1. 扩展有正确的 host_permissions
2. 脚本的 @connect 列表包含目标域名
3. 用户已授权该域名（如果需要）

### Q4: 如何在 MV3 中实现 @updateURL？

MV3 中仍然可以通过后台脚本定期检查更新：

```typescript
async function checkForUpdates() {
  const scripts = await db.scripts.toArray();

  for (const script of scripts) {
    if (script.metadata.updateURL) {
      const response = await fetch(script.metadata.updateURL);
      const code = await response.text();
      const metadata = parseMetadata(code);

      if (isNewerVersion(metadata.version, script.metadata.version)) {
        // 提示用户更新
        showUpdateNotification(script, metadata);
      }
    }
  }
}

// 使用 alarms 定期检查
chrome.alarms.create("check_updates", {
  periodInMinutes: 24 * 60, // 每天
});
```

### Q5: chrome.userScripts 不支持 @include 正则怎么办？

`chrome.userScripts.register` 的 `matches` 只支持 Chrome 匹配模式。

#### 解决方案

使用预检查包装器：

```typescript
const MATCHER_CODE = `
function patternToRegExp(pattern) {
  // 实现 Chrome 模式和正则到 RegExp 的转换
}

function matchesPattern(pattern, url) {
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    return new RegExp(pattern.slice(1, -1)).test(url)
  }
  // 处理其他模式
}
`;

// 包装脚本代码
const wrapperCode = `
(function() {
  const currentUrl = window.location.href;
  const includes = ${JSON.stringify(includes)};
  
  if (!includes.some(p => matchesPattern(p, currentUrl))) {
    return;
  }
  
  // 原始脚本代码
  ${script.code}
})();
`;
```

---

## 最佳实践

### 1. 使用 TypeScript

TypeScript 可以帮助捕获类型错误，特别是在处理 Chrome API 时：

```typescript
import type { UserScript } from "./types";

async function handleScript(script: UserScript) {
  // 类型安全
  await chrome.userScripts.register([
    {
      id: script.id,
      matches: script.metadata.matches,
      // ...
    },
  ]);
}
```

### 2. 错误处理

Service Worker 可能随时终止，需要处理错误：

```typescript
chrome.runtime.onSuspend.addListener(() => {
  // 保存必要状态
  saveState();
});

// 每次启动时恢复状态
chrome.runtime.onStartup.addListener(() => {
  restoreState();
});
```

### 3. 日志记录

使用结构化的日志系统便于调试：

```typescript
import { logger } from "./lib/logger";

logger.debug("Script registered", {
  id: script.id,
  matches: script.metadata.matches,
});
logger.error("Failed to update script", { id, error: error.message });
```

### 4. 测试覆盖率

- 单元测试：测试解析器、匹配器等纯函数
- 集成测试：测试脚本注册、注入流程
- E2E 测试：使用 Puppeteer 测试完整用户流程

### 5. 性能监控

监控关键指标：

```typescript
const startTime = performance.now();
await registerScript(script);
const duration = performance.now() - startTime;

logger.debug("Registration time", { id: script.id, duration });
```

---

## 参考资料

- [Chrome Extension MV3 迁移指南](https://developer.chrome.com/docs/extensions/migrating/)
- [chrome.userScripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- [Service Worker 生命周期](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Content Security Policy](https://developer.chrome.com/docs/extensions/mv3/content_security_policy/)
