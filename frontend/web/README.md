# ReadFlow Web

生产前端只包含一个静态入口：

| 页面 | HTML | 源码入口 | 构建产物 |
|---|---|---|---|
| 工作台 | `workbench.html` | `src/app/workbench/entry.tsx` | `dist/workbench.bundle.js` |

工作台包含书桌、文献库、笔记、画布、闪卡复习和设置。原生 React 阅读器在工作台标签页内保活。
CSS 构建到 `dist/css/workbench.css`，HTML 缓存参数由构建脚本生成。

在本目录运行 `npm run build`、`npm run typecheck` 和 `npm test`。本机安装 Chrome 时，
`npm run smoke` 会以单浏览器、串行方式运行全部离线 `*-smoke.mjs`，任一场景失败即返回非零。
该命令不在缺少 Chrome 的 CI 中运行。
运行 `node scripts/audit-entry-reachability.mjs /tmp/readflow-audit` 可导出 esbuild metafile、类型与样式依赖清单，并检查不可达源码。

源码依赖方向为 app → features → platform，ui 提供共享组件；跨功能引用使用 index/domain 出口。
阅读器实现在 `src/features/paper-reader`，直接使用 pdfjs-dist；批注、画布、闪卡与 AI 使用 ReadFlow 本地接口。
用户说明见 [ReadFlow 文档](../../docs/readflow/README.md)。
