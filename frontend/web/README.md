# ReadFlow Web

生产前端只包含两个静态入口：

| 页面 | HTML | 源码入口 | 构建产物 |
|---|---|---|---|
| 工作台 | `workbench.html` | `src/app/workbench/entry.tsx` | `dist/workbench.bundle.js` |
| 阅读器 | `reader.html` | `src/app/reader/entry.tsx` | `dist/reader.bundle.js` |

工作台包含书桌、文献库、笔记和设置。阅读器在同源 iframe 内打开，也支持独立访问。
CSS 分别构建到 `dist/css/workbench.css` 与 `dist/css/reader.css`，HTML 缓存参数由构建脚本生成。

在本目录运行 `npm run build`、`npm run typecheck` 和 `npm test`。
运行 `node scripts/audit-entry-reachability.mjs /tmp/readflow-audit` 可导出 esbuild metafile、类型与样式依赖清单，并检查不可达源码。

源码依赖方向为 app → features → platform，ui 提供共享组件；跨功能引用使用 index/domain 出口。
阅读器实现及样式在 `../packages/reader`，Web 仅通过公开子路径注入 API、凭据、批注与下载适配器。
用户说明见 [ReadFlow 文档](../../docs/readflow/README.md)。
