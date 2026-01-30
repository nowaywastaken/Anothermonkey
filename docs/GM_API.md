# GM API 参考

## 目录

- [概述](#概述)
- [核心 API](#核心-api)
- [存储 API](#存储-api)
- [资源 API](#资源-api)
- [网络 API](#网络-api)
- [通知 API](#通知-api)
- [UI API](#ui-api)
- [菜单 API](#菜单-api)
- [Cookie API](#cookie-api)
- [元数据 API](#元数据-api)
- [现代异步 API](#现代异步-api)
- [使用示例](#使用示例)

---

## 概述

AnotherMonkey 实现了完整的 Greasemonkey API，让用户脚本可以访问强大的浏览器功能。所有 API 都遵循 Greasemonkey 规范，并与 Tampermonkey 和 Violentmonkey 兼容。

### 可用性检查

在脚本中检查 API 是否可用：

```javascript
if (typeof GM_xmlhttpRequest !== "undefined") {
  // API 可用
}
```

---

## 核心 API

### GM_info

提供关于脚本和扩展的信息。

```javascript
GM_info.script; // 脚本元数据
GM_info.scriptHandler; // 脚本处理器名称 ("AnotherMonkey")
GM_info.version; // 扩展版本
```

#### 示例

```javascript
console.log("Script:", GM_info.script.name);
console.log("Version:", GM_info.script.version);
console.log("Handler:", GM_info.scriptHandler);
```

#### 返回值

```typescript
{
  script: {
    name: string;              // 脚本名称
    namespace: string;         // 命名空间
    version: string;           // 版本号
    description: string;       // 描述
    author: string;            // 作者
    matches: string[];         // 匹配模式
    excludes: string[];        // 排除模式
    includes: string[];        // 包含模式
    grants: string[];         // 授权的 API
    resources: Array<{         // 资源
      name: string;
      url: string;
    }>;
    'run-at': string;         // 执行时机
    id: string;              // AnotherMonkey 生成的 ID
  };
  scriptHandler: string;      // 总是 "AnotherMonkey"
  version: string;           // 扩展版本
}
```

### unsafeWindow

直接访问页面的 window 对象，绕过脚本隔离。

```javascript
unsafeWindow.someGlobalVariable = "value";
```

#### 注意

- ⚠️ 修改 unsafeWindow 可能影响页面正常工作
- ⚠️ 仅在 `@grant unsafeWindow` 时可用
- ⚠️ 安全风险：页面的代码可以访问你设置的值

#### 使用场景

```javascript
// 修改页面全局变量
unsafeWindow.jQuery = myCustomJQuery;

// 读取页面数据
const pageData = unsafeWindow.pageConfig;
```

---

## 存储 API

提供持久化存储，每个脚本有独立的命名空间。

### GM_setValue

存储一个值。

```javascript
GM_setValue(key, value);
```

#### 参数

| 参数  | 类型   | 说明                        |
| ----- | ------ | --------------------------- |
| key   | string | 键名                        |
| value | any    | 要存储的值（JSON 可序列化） |

#### 示例

```javascript
GM_setValue("username", "Alice");
GM_setValue("settings", {
  theme: "dark",
  language: "en",
});
GM_setValue("counter", 42);
```

### GM_getValue

获取一个值，可指定默认值。

```javascript
value = GM_getValue(key, defaultValue);
```

#### 参数

| 参数         | 类型   | 说明                 |
| ------------ | ------ | -------------------- |
| key          | string | 键名                 |
| defaultValue | any    | 不存在时返回的默认值 |

#### 返回值

存储的值或默认值。

#### 示例

```javascript
const username = GM_getValue("username", "Guest");
const settings = GM_getValue("settings", {
  theme: "light",
  language: "en",
});
const counter = GM_getValue("counter", 0);
```

### GM_deleteValue

删除一个值。

```javascript
GM_deleteValue(key);
```

#### 参数

| 参数 | 类型   | 说明         |
| ---- | ------ | ------------ |
| key  | string | 要删除的键名 |

#### 示例

```javascript
GM_deleteValue("username");
```

### GM_listValues

列出当前脚本存储的所有键名。

```javascript
keys = GM_listValues();
```

#### 返回值

键名数组。

#### 示例

```javascript
const keys = GM_listValues();
console.log("Stored keys:", keys);
// ['username', 'settings', 'counter']
```

---

## 资源 API

管理 @require 和 @resource 声明的资源。

### GM_getResourceText

获取 @resource 声明的资源内容。

```javascript
text = GM_getResourceText(name);
```

#### 参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| name | string | 资源名称 |

#### 返回值

资源文本内容。

#### 示例

```javascript
// ==UserScript==
// @resource icon https://example.com/icon.svg
// ==/UserScript==

const iconSvg = GM_getResourceText("icon");
document.getElementById("icon-container").innerHTML = iconSvg;
```

### GM_getResourceURL

获取 @resource 声明的资源 URL（blob URL）。

```javascript
url = GM_getResourceURL(name);
```

#### 参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| name | string | 资源名称 |

#### 返回值

资源的 blob URL（浏览器内存中的 URL）。

#### 示例

```javascript
// ==UserScript==
// @resource image https://example.com/logo.png
// ==/UserScript==

const imageUrl = GM_getResourceURL("image");
document.querySelector("img").src = imageUrl;
```

---

## 网络 API

### GM_xmlhttpRequest

发起跨域 HTTP 请求，支持进度监听和响应处理。

```javascript
requestId = GM_xmlhttpRequest(details);
```

#### 参数

| 参数         | 类型     | 说明                         |
| ------------ | -------- | ---------------------------- |
| method       | string   | HTTP 方法（GET, POST, HEAD） |
| url          | string   | 请求 URL                     |
| headers      | object   | 请求头                       |
| data         | string   | 请求体（POST）               |
| binary       | boolean  | 是否以二进制模式             |
| timeout      | number   | 超时时间（毫秒）             |
| responseType | string   | 响应类型                     |
| onprogress   | function | 进度回调                     |
| onload       | function | 完成回调                     |
| onerror      | function | 错误回调                     |
| onabort      | function | 中止回调                     |
| ontimeout    | function | 超时回调                     |
| context      | any      | 传递给回调的上下文           |

#### 返回值

包含 `abort()` 方法的请求对象。

#### 示例

```javascript
// 基本 GET 请求
GM_xmlhttpRequest({
  method: "GET",
  url: "https://api.example.com/data",
  onload: function (response) {
    console.log("Status:", response.status);
    console.log("Response:", response.responseText);
    const data = JSON.parse(response.responseText);
  },
});

// POST 请求
GM_xmlhttpRequest({
  method: "POST",
  url: "https://api.example.com/submit",
  headers: {
    "Content-Type": "application/json",
  },
  data: JSON.stringify({
    name: "Alice",
    message: "Hello",
  }),
  onload: function (response) {
    console.log("Success!");
  },
});

// 带进度监听
GM_xmlhttpRequest({
  method: "GET",
  url: "https://example.com/large-file.zip",
  onprogress: function (response) {
    const percent = Math.round((response.loaded / response.total) * 100);
    console.log("Downloaded:", percent + "%");
  },
  onload: function (response) {
    console.log("Download complete");
  },
});

// 二进制响应
GM_xmlhttpRequest({
  method: "GET",
  url: "https://example.com/image.png",
  responseType: "blob",
  onload: function (response) {
    const blobUrl = URL.createObjectURL(response.response);
    document.querySelector("img").src = blobUrl;
  },
});

// 超时处理
GM_xmlhttpRequest({
  method: "GET",
  url: "https://example.com/slow-endpoint",
  timeout: 5000,
  ontimeout: function () {
    console.log("Request timed out");
  },
  onload: function (response) {
    console.log("Request completed");
  },
});

// 可中止的请求
const request = GM_xmlhttpRequest({
  method: "GET",
  url: "https://example.com/data",
  onload: function (response) {
    console.log(response.responseText);
  },
});

// 5 秒后中止请求
setTimeout(() => {
  request.abort();
}, 5000);
```

#### 响应对象

```javascript
{
  status: number; // HTTP 状态码
  statusText: string; // 状态文本
  readyState: number; // 就绪状态
  responseHeaders: string; // 响应头
  responseText: string; // 响应文本
  response: any; // 响应数据（根据 responseType）
  finalUrl: string; // 最终 URL（重定向后）
  context: any; // 传递的上下文
  loaded: number; // 已加载字节数（onprogress）
  total: number; // 总字节数（onprogress）
}
```

### GM_download

下载文件到本地。

```javascript
request = GM_download(details);
```

#### 参数

| 参数       | 类型     | 说明                   |
| ---------- | -------- | ---------------------- |
| url        | string   | 下载 URL               |
| name       | string   | 保存的文件名           |
| headers    | object   | 请求头                 |
| saveAs     | boolean  | 是否显示"另存为"对话框 |
| onprogress | function | 进度回调               |
| onload     | function | 完成回调               |
| onerror    | function | 错误回调               |

#### 返回值

包含 `abort()` 方法的请求对象。

#### 示例

```javascript
GM_download({
  url: "https://example.com/file.pdf",
  name: "document.pdf",
  saveAs: true,
  onload: function (result) {
    console.log("Downloaded to:", result.filename);
  },
  onprogress: function (progress) {
    const percent = Math.round((progress.loaded / progress.total) * 100);
    console.log("Progress:", percent + "%");
  },
});
```

---

## 通知 API

### GM_notification

显示桌面通知。

```javascript
notificationId = GM_notification(details, ondone);
```

#### 参数

| 参数      | 类型     | 说明                 |
| --------- | -------- | -------------------- |
| text      | string   | 通知文本             |
| title     | string   | 通知标题             |
| imageUrl  | string   | 图标 URL             |
| timeout   | number   | 自动关闭时间（毫秒） |
| onclick   | function | 点击回调             |
| ondone    | function | 关闭回调             |
| buttons   | array    | 按钮（最多 2 个）    |
| highlight | boolean  | 是否高亮显示         |
| silent    | boolean  | 是否静音             |

#### 返回值

通知 ID 字符串。

#### 示例

```javascript
// 基本通知
GM_notification({
  text: "Script updated successfully",
  title: "AnotherMonkey",
});

// 带点击事件
GM_notification({
  text: "Click to open settings",
  title: "Settings Available",
  onclick: function () {
    GM_openInTab(chrome.runtime.getURL("options.html"));
  },
});

// 带按钮
GM_notification({
  text: "New version available",
  title: "Update Available",
  buttons: [
    {
      title: "Update Now",
      onClick: function () {
        updateScript();
      },
    },
    {
      title: "Later",
      onClick: function () {
        console.log("Postponed");
      },
    },
  ],
});

// 自动关闭
GM_notification({
  text: "Operation complete",
  timeout: 3000, // 3 秒后关闭
});
```

---

## UI API

### GM_openInTab

在新标签页中打开 URL。

```javascript
GM_openInTab(url, options);
```

#### 参数

| 参数      | 类型    | 说明                   |
| --------- | ------- | ---------------------- |
| url       | string  | 要打开的 URL           |
| active    | boolean | 是否激活标签页         |
| insert    | boolean | 是否插入到当前标签页后 |
| setParent | boolean | 是否设置为父标签页     |

#### 示例

```javascript
// 打开新标签页
GM_openInTab("https://example.com");

// 打开并激活
GM_openInTab("https://example.com", { active: true });

// 在当前标签页后插入
GM_openInTab("https://example.com", { insert: true });
```

### GM_addStyle

添加 CSS 样式到页面。

```javascript
styleElement = GM_addStyle(css);
```

#### 参数

| 参数 | 类型   | 说明     |
| ---- | ------ | -------- |
| css  | string | CSS 代码 |

#### 返回值

添加的 `<style>` 元素。

#### 示例

```javascript
// 添加样式
GM_addStyle(`
  .my-custom-class {
    background-color: #ff0000;
    color: white;
    padding: 10px;
  }
`);

// 动态修改样式
const styleElement = GM_addStyle("body { background-color: black; }");

// 后续修改
styleElement.textContent = "body { background-color: white; }";
```

---

## 菜单 API

### GM_registerMenuCommand

在浏览器扩展菜单中注册命令。

```javascript
commandId = GM_registerMenuCommand(caption, onClick);
```

#### 参数

| 参数      | 类型     | 说明           |
| --------- | -------- | -------------- |
| caption   | string   | 菜单项文本     |
| onClick   | function | 点击回调       |
| accessKey | string   | 访问键（可选） |

#### 返回值

命令 ID。

#### 示例

```javascript
const cmdId = GM_registerMenuCommand("Show Settings", function () {
  alert("Settings clicked!");
});

const cmdId2 = GM_registerMenuCommand("Refresh Data", function () {
  location.reload();
});
```

---

## Cookie API

### GM_cookie

管理 Cookie。

```javascript
GM_cookie(action, details, callback);
```

#### 参数

| 参数     | 类型     | 说明                          |
| -------- | -------- | ----------------------------- |
| action   | string   | 操作类型（list, set, delete） |
| details  | object   | Cookie 详细信息               |
| callback | function | 完成回调                      |

#### 操作类型

**list**: 列出 Cookie

```javascript
GM_cookie(
  "list",
  {
    url: "https://example.com",
    name: "sessionid",
  },
  function (cookies, error) {
    if (error) {
      console.error(error);
    } else {
      console.log("Cookies:", cookies);
    }
  },
);
```

**set**: 设置 Cookie

```javascript
GM_cookie(
  "set",
  {
    url: "https://example.com",
    name: "username",
    value: "Alice",
  },
  function (cookie, error) {
    if (error) {
      console.error(error);
    } else {
      console.log("Cookie set:", cookie);
    }
  },
);
```

**delete**: 删除 Cookie

```javascript
GM_cookie(
  "delete",
  {
    url: "https://example.com",
    name: "sessionid",
  },
  function (result, error) {
    if (error) {
      console.error(error);
    } else {
      console.log("Cookie deleted");
    }
  },
);
```

---

## 元数据 API

### GM_log

日志输出（控制台）。

```javascript
GM_log(message);
```

#### 示例

```javascript
GM_log("Script started");
GM_log("Processing " + items.length + " items");
```

---

## 现代异步 API

AnotherMonkey 也支持现代的 Promise-based API。

### GM.getValue / GM.setValue

```javascript
// 异步存储
await GM.setValue("username", "Alice");
const username = await GM.getValue("username", "Guest");

// 异步删除
await GM.deleteValue("username");

// 异步列出所有键
const keys = await GM.listValues();
```

### GM.xmlHttpRequest

```javascript
const response = await new Promise((resolve) => {
  GM.xmlHttpRequest({
    method: "GET",
    url: "https://api.example.com/data",
    onload: resolve,
  });
});
```

### GM.notification

```javascript
await GM.notification({
  text: "Async notification",
  title: "AnotherMonkey",
});
```

---

## 使用示例

### 完整的用户脚本示例

```javascript
// ==UserScript==
// @name         Example Script
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Example userscript demonstrating GM APIs
// @author       You
// @match        https://example.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_openInTab
// @connect      api.example.com
// @resource     logo https://example.com/logo.png
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // 1. 脚本信息
  console.log("Script Name:", GM_info.script.name);
  console.log("Script Version:", GM_info.script.version);

  // 2. 存储使用
  let visitCount = GM_getValue("visitCount", 0);
  visitCount++;
  GM_setValue("visitCount", visitCount);

  // 3. 添加样式
  GM_addStyle(`
        .anmon-visited-badge {
            position: fixed;
            top: 10px;
            right: 10px;
            background: #10b981;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            font-family: sans-serif;
            z-index: 9999;
        }
    `);

  // 4. 显示访问计数
  const badge = document.createElement("div");
  badge.className = "anmon-visited-badge";
  badge.textContent = `Visits: ${visitCount}`;
  document.body.appendChild(badge);

  // 5. 网络请求
  GM_xmlhttpRequest({
    method: "GET",
    url: "https://api.example.com/status",
    onload: function (response) {
      console.log("API Status:", response.responseText);
    },
  });

  // 6. 通知
  GM_notification({
    text: `Welcome back! Visit count: ${visitCount}`,
    title: "Example Script",
  });

  // 7. 资源使用
  const logoUrl = GM_getResourceURL("logo");
  const logoImg = document.createElement("img");
  logoImg.src = logoUrl;
  document.body.appendChild(logoImg);

  // 8. 菜单命令
  GM_registerMenuCommand("Reset Count", function () {
    GM_setValue("visitCount", 0);
    location.reload();
  });

  // 9. 打开设置
  GM_registerMenuCommand("Open Settings", function () {
    GM_openInTab("https://example.com/settings");
  });

  console.log("Example Script loaded successfully!");
})();
```

### 异步 API 示例

```javascript
// ==UserScript==
// @name         Async API Example
// @namespace    http://tampermonkey.net/
// @version      1.0
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

(async function () {
  "use strict";

  try {
    // 异步存储
    await GM.setValue("lastVisit", Date.now());
    const lastVisit = await GM.getValue("lastVisit");
    console.log("Last visit:", new Date(lastVisit));

    // 异步请求
    const response = await new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url: "https://api.example.com/data",
        onload: resolve,
        onerror: reject,
      });
    });

    console.log("Response:", response.responseText);
  } catch (error) {
    console.error("Error:", error);
  }
})();
```

---

## 注意事项

### 权限要求

所有 GM API 都必须在元数据中声明：

```javascript
// @grant GM_xmlhttpRequest
// @grant GM_setValue
// @grant GM_getValue
// @grant GM_notification
// @grant unsafeWindow
```

如果没有 `@grant` 声明，脚本以 `@grant none` 模式运行，只能访问基本功能。

### 跨域请求

- 脚本必须声明 `@connect` 域名
- 扩展必须有相应的 `host_permissions`
- 可能需要用户授权

### 存储限制

- 每个脚本有独立的命名空间
- 建议存储 JSON 可序列化的数据
- 避免存储大文件（使用 IndexedDB）

### 安全建议

- 不要存储敏感信息（密码、令牌）
- 验证从网络获取的数据
- 谨慎使用 `unsafeWindow`

---

## 参考资料

- [Greasemonkey API 文档](https://wiki.greasespot.net/API_reference)
- [Tampermonkey 文档](https://www.tampermonkey.net/documentation.php)
- [Violentmonkey 文档](https://violentmonkey.github.io/api/)
