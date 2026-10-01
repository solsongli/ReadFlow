# 原 Home 文献管理增量

本功能由原 `HomeApp` 的 `research` tab 装配，保留图书馆、合集、收藏、AI 问答、原底部 dock、主题和共享对话框。入口仍为 `index.html?tab=research`，未嵌独立 research-library App、侧栏或 PDF 组件。

- `platform/api/research-library.ts` 通过原 `buildApiUrl` / `buildApiHeaders` 接入网关 `/api/research`。
- 书目、分类、附件、JSON 导入预览与原始来源 JSON 导出使用已完成的文献管理后端。
- 迁移采用来源 ID 与预览 hash；确认前列明未覆盖字段。官方浏览器 Connector 直连仍未验证。
- 阅读前 POST 附件 `native-reader` 重验。失败保留文献与 PDF，显示原因和重试；不会回退到第二套阅读器。
- 阅读用原 `navigateToReader` 软打开 `reader.html`，同时携带 PDF SHA-256、paper UUID、attachment UUID。共享一个 PDF 的不同论文不能共享笔记上下文。
- 原阅读器的持久笔记由 Reader 的公开 adapter 接线负责；本页不再实现阅读引擎。
- 独立文献库旧成果保持原样，当前新功能不自动迁移任何既有私人库。

关键回归：新 tab 深链与旧导航、同哈希不同论文的 Reader 路由隔离、无效身份或页码阻止打开。测试见 `tests/research-library/native-integration.test.mjs`。
