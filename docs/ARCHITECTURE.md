# 技术架构文档

## 目录

- [概述](#概述)
- [核心架构](#核心架构)
- [模块设计](#模块设计)
- [数据流](#数据流)
- [安全机制](#安全机制)
- [性能优化](#性能优化)

---

## 概述

AnotherMonkey 是一个基于 Plasmo 框架和 Chrome Manifest V3 的现代化用户脚本管理器。项目采用模块化架构，将核心功能解耦到独立的模块中，便于维护和扩展。

### 技术栈

- **框架**: [Plasmo](https://www.plasmo.com/) - 现代浏览器扩展框架
- **UI**: React 18 + TypeScript
- **编辑器**: Monaco Editor (VS Code 内核)
- **数据库**: Dexie (IndexedDB 封装)
- **样式**: Tailwind CSS
- **API**: Chrome Extension Manifest V3

---

## 核心架构

### 扩展组件

```
AnotherMonkey/
├── background/          # Service Worker (后台服务)
│   ├── index.ts       # 主入口，监听消息和事件
│   └── api-handler.ts # GM API 代理处理器
├── contents/          # Content Scripts (内容脚本)
│   └── install.tsx   # 拦截 .user.js 文件
├── tabs/              # 扩展页面
│   ├── install.tsx    # 脚本安装页面
│   └── permission.tsx # 权限请求页面
├── components/        # React 组件
│   ├── ScriptList.tsx # 脚本列表组件
│   ├── ScriptEditor.tsx # 脚本编辑器组件
│   └── Toast.tsx     # 通知组件
├── lib/              # 核心库
│   ├── db.ts          # IndexedDB 数据库
│   ├── parser.ts      # 元数据解析器
│   ├── script-manager.ts # 脚本管理器
│   ├── gm-api.ts      # GM API 实现
│   ├── matcher.ts     # URL 匹配器
│   ├── logger.ts      # 日志系统
│   ├── cloud-sync.ts  # 云同步
│   ├── script-stats.ts # 脚本统计
│   └── types.ts      # TypeScript 类型定义
├── options.tsx        # 选项页面
└── popup.tsx         # 弹出窗口
```

### 执行流程

#### 1. 脚本安装流程

```
用户访问 .user.js 文件
    ↓
contents/install.tsx 拦截请求
    ↓
提取脚本代码并发送到后台
    ↓
打开 tabs/install.tsx 显示安装对话框
    ↓
用户确认安装
    ↓
parser.ts 解析元数据
    ↓
获取依赖（@require, @resource）
    ↓
保存到 IndexedDB
    ↓
script-manager.ts 同步到 chrome.userScripts
    ↓
脚本注入到匹配的页面
```

#### 2. 脚本注入流程

```
用户访问网页
    ↓
chrome.userScripts 自动匹配 URL
    ↓
匹配成功，执行脚本
    ↓
注入 GM_API_CODE
    ↓
脚本可以调用 GM API
    ↓
API 调用通过消息发送到 background
    ↓
api-handler.ts 处理请求
    ↓
返回结果到脚本
```

---

## 模块设计

### 1. 数据库模块 (lib/db.ts)

使用 Dexie 封装 IndexedDB，提供类型安全的数据库访问。

#### 表结构

**scripts 表**

```typescript
{
  id: string;                    // 脚本唯一 ID (UUID)
  code: string;                  // 源代码
  enabled: boolean;              // 是否启用
  metadata: ScriptMetadata;       // 元数据
  lastModified: number;          // 最后修改时间戳
  preferredWorld?: string;        // 执行环境
  dependencyCache?: {            // 依赖缓存
    [url: string]: string;
  };
}
```

**values 表**

```typescript
{
  scriptId: string; // 关联脚本 ID
  key: string; // 键
  value: any; // 值
}
// 复合主键: [scriptId, key]
```

**permissions 表**

```typescript
{
  scriptId: string; // 脚本 ID
  domain: string; // 域名
  allow: boolean; // 是否允许
}
// 复合主键: [scriptId, domain]
```

**scriptStats 表**

```typescript
{
  scriptId: string; // 脚本 ID
  runCount: number; // 运行次数
  lastRun: number; // 最后运行时间
  totalErrors: number; // 总错误数
}
```

**syncItems 表**

```typescript
{
  id: string;          // 同步项 ID
  scriptId: string;    // 脚本 ID
  lastSynced: number;  // 最后同步时间
  remoteId?: string;   // 远程 ID
  status: 'synced' | 'pending' | 'conflict';
}
```

### 2. 元数据解析器 (lib/parser.ts)

解析用户脚本的元数据块（`// ==UserScript==` 和 `// ==/UserScript==` 之间）。

#### 支持的元数据字段

| 字段         | 说明                   |
| ------------ | ---------------------- |
| @name        | 脚本名称（支持本地化） |
| @namespace   | 命名空间               |
| @version     | 版本号                 |
| @description | 描述（支持本地化）     |
| @author      | 作者（支持本地化）     |
| @match       | Chrome 匹配模式        |
| @include     | 包含模式（支持正则）   |
| @exclude     | 排除模式               |
| @grant       | 授权的 GM API          |
| @connect     | 允许连接的域名         |
| @require     | 依赖的外部脚本         |
| @resource    | 资源文件               |
| @run-at      | 执行时机               |
| @noframes    | 是否在 iframe 中运行   |
| @updateURL   | 更新 URL               |
| @downloadURL | 下载 URL               |

### 3. 脚本管理器 (lib/script-manager.ts)

核心脚本管理逻辑，包括注册、更新、同步等。

#### 主要功能

- `syncScripts()`: 同步脚本到 chrome.userScripts
- `checkForUpdates()`: 检查所有脚本更新
- `injectIntoExistingTabs()`: 向已打开的标签页注入脚本
- `buildScriptPayload()`: 构建脚本注入载荷
- 批量操作：enable, disable, delete

#### 脚本注入逻辑

```typescript
async function buildScriptPayload(script: UserScript) {
  const world = determineExecutionWorld(script);

  const payload = {
    js: [
      { code: GM_API_CODE }, // GM API 实现
      { code: dependencies }, // @require 依赖
      { code: wrapperCode + script.code }, // 预检查包装 + 代码
    ],
    world,
  };

  return payload;
}
```

### 4. GM API 实现 (lib/gm-api.ts)

在脚本环境中注入 GM API，通过消息传递与后台通信。

#### 支持的 API

- `GM_info`: 脚本信息
- `GM_xmlhttpRequest`: 跨域请求
- `GM_setValue` / `GM_getValue` / `GM_deleteValue` / `GM_listValues`: 存储
- `GM_addStyle`: 添加样式
- `GM_notification`: 显示通知
- `GM_openInTab`: 打开标签页
- `GM_download`: 下载文件
- `GM_cookie`: Cookie 操作
- `GM_registerMenuCommand`: 注册菜单命令

#### 现代异步 API

```javascript
GM.getValue(key, defaultValue);
GM.setValue(key, value);
GM.deleteValue(key);
GM.listValues();
```

### 5. URL 匹配器 (lib/matcher.ts)

支持多种匹配模式：

1. **Chrome 匹配模式**: `https://*.google.com/*`
2. **正则表达式**: `/^https:\/\/example\.com\/.*/`
3. **Glob 模式**: `*://example.com/*`

#### 匹配优先级

```
@exclude > @include > @match
```

### 6. 云同步 (lib/cloud-sync.ts)

通过 Google Drive API 实现脚本备份和恢复。

#### 同步流程

```
1. 获取 OAuth Token
2. 查找现有的备份文件
3. 上传/下载数据
4. 合并策略（远程优先）
```

---

## 数据流

### GM API 调用流程

```
User Script (页面上下文)
    ↓
GM_xmlhttpRequest()
    ↓
chrome.runtime.sendMessage()
    ↓
Service Worker (background/index.ts)
    ↓
handleGMRequest() (api-handler.ts)
    ↓
fetch() 或 chrome.downloads.download()
    ↓
返回结果
    ↓
chrome.runtime.sendMessage() 或 Port.postMessage()
    ↓
User Script 接收响应
```

### 脚本值存储流程

```
GM_setValue(key, value)
    ↓
缓存到内存 (valueCache)
    ↓
异步发送到后台
    ↓
保存到 IndexedDB
    ↓
下次读取时从缓存返回
```

---

## 安全机制

### 1. 脚本隔离

每个脚本运行在独立的 JavaScript 世界中：

- **USER_SCRIPT 世界**: 默认，与页面隔离
- **MAIN 世界**: 需要明确指定，可与页面交互
- **独立 World ID**: 使用脚本 UUID 作为唯一世界 ID

### 2. 权限控制

#### @connect 域名白名单

脚本只能向 `@connect` 指定的域名发起请求，用户可以动态授权。

#### @grant 显式授权

脚本必须显式声明需要的 GM API，未声明的 API 不可用。

#### CSP 保护

配置了严格的 Content Security Policy：

```
script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; object-src 'none'
```

### 3. 依赖管理

- **@require**: 自动下载并缓存外部脚本
- **@resource**: 自动下载并缓存资源文件
- **验证**: 缓存时验证 URL 和内容

---

## 性能优化

### 1. 代码分割

- 按需加载组件
- Monaco Editor 动态导入

### 2. 缓存策略

- **依赖缓存**: 避免重复下载
- **值缓存**: 同步读取，异步更新
- **预编译**: 提前构建正则表达式

### 3. 延迟注入

- 只注入到匹配的页面
- 支持 @noframes 减少 iframe 注入

### 4. 批量操作

- 批量启用/禁用/删除脚本
- 减少数据库写入次数

---

## 扩展点

### 添加新的 GM API

1. 在 `lib/gm-api.ts` 中定义 API
2. 在 `lib/background/api-handler.ts` 中实现处理器
3. 在 `lib/parser.ts` 中添加 @grant 解析（如果需要）

### 自定义匹配器

扩展 `lib/matcher.ts` 支持新的匹配模式。

### 云存储提供商

创建新的云同步实现，替换 `lib/cloud-sync.ts`。

---

## 调试

### 开发模式

```bash
npm run dev
```

### 日志系统

```typescript
import { logger } from "~lib/logger";

logger.debug("Debug message");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message");
```

### 数据库检查

在 Chrome DevTools 的 Application 标签中查看 IndexedDB：

```
Application → Storage → IndexedDB → anothermonkey_db
```

---

## 参考资料

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Plasmo Documentation](https://docs.plasmo.com/)
- [Greasemonkey API](https://wiki.greasespot.net/API_reference)
- [UserScripts.org Metadata Block](https://wiki.greasespot.net/Metadata_Block)
