
# AnotherMonkey - 现代化用户脚本管理器

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/develop/migrate)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

基于 Plasmo 框架和 Chrome Manifest V3 的新一代用户脚本管理器,提供强大的脚本注入、跨域请求和云同步功能。

[功能特性](#功能特性) • [快速开始](#快速开始) • [开发指南](#开发指南) • [文档](#文档) • [贡献](#贡献)

---

## 功能特性

### 核心功能

- ✨ **MV3 原生支持** - 使用最新的 `chrome.userScripts` API
- 🔒 **安全隔离** - 每个脚本运行在独立的 JavaScript 世界中
- 🌐 **完整 GM API** - 支持 `GM_xmlhttpRequest`、`GM_setValue`、`GM_notification` 等
- ☁️ **云端同步** - Google Drive 脚本备份和恢复
- 🎨 **现代化 UI** - React + Monaco Editor,支持深色模式
- 🔄 **自动更新** - 定期检查脚本更新(`@updateURL`)

### 高级特性

- 🛡️ **动态权限** - `@connect` 域名白名单自动请求
- 📊 **脚本统计** - 运行次数、错误追踪
- 🎯 **智能匹配** - 支持 `@match`、`@include`(含正则)、`@exclude`
- 📦 **依赖管理** - 自动下载和缓存 `@require` 库和 `@resource` 资源
- 🚀 **性能优化** - 元数据预编译、心跳预热、Shadow Storage 影子存储

---

## 快速开始

### 安装

1. **克隆仓库**

   ```bash
   git clone https://github.com/your-username/Anothermonkey.git
   cd Anothermonkey
   ```

2. **安装依赖**

   ```bash
   npm install
   ```

3. **开发模式运行**

   ```bash
   npm run dev
   ```

4. **加载到浏览器**
   - 打开 Chrome 浏览器,访问 `chrome://extensions/`
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `build/chrome-mv3-dev` 目录

### 生产构建

```bash
npm run build
```

构建产物位于 `build/chrome-mv3-prod` 目录。

---

## 开发指南

### 项目结构

```text
Anothermonkey/
├── src/
│   ├── background/         # Service Worker 后台服务
│   │   ├── index.ts       # 主入口
│   │   └── api-handler.ts # GM API 代理
│   ├── lib/               # 核心库
│   │   ├── db.ts          # IndexedDB 数据库
│   │   ├── parser.ts      # 元数据解析
│   │   ├── script-manager.ts # 脚本管理
│   │   ├── gm-api.ts      # GM API 实现
│   │   ├── matcher.ts     # URL 匹配
│   │   └── logger.ts      # 日志系统
│   ├── components/        # React 组件
│   ├── tabs/              # 扩展页面
│   ├── options.tsx        # 选项页面
│   └── popup.tsx          # 弹出窗口
├── docs/                  # 详细文档
└── package.json
```

### 开发命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器(热重载) |
| `npm run build` | 生产环境构建 |
| `npm run package` | 打包为 .crx 文件 |

### 技术栈

- **框架**: [Plasmo](https://www.plasmo.com/) - 浏览器扩展框架
- **UI**: React 18 + TypeScript
- **编辑器**: Monaco Editor (VS Code 内核)
- **数据库**: Dexie (IndexedDB 封装)
- **样式**: Tailwind CSS

---

## 文档

- [技术架构](docs/ARCHITECTURE.md) - 系统设计和核心模块
- [MV3 迁移指南](docs/MV3_MIGRATION.md) - 从 MV2 到 MV3 的适配
- [GM API 实现](docs/GM_API.md) - 完整的 Greasemonkey API 参考

---

## 贡献

欢迎贡献代码!请查看 [贡献指南](CONTRIBUTING.md)。

### 开发流程

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

---

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

## 致谢

- [Tampermonkey](https://www.tampermonkey.net/) - 用户脚本管理器标杆
- [Violentmonkey](https://violentmonkey.github.io/) - 开源用户脚本管理器
- [Plasmo](https://www.plasmo.com/) - 优秀的扩展开发框架
- Chrome Extension Community

---

**[⬆ 回到顶部](#anothermonkey---现代化用户脚本管理器)**

Made with ❤️ by the AnotherMonkey Team
