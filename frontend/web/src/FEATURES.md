# 源码结构

- `app/workbench`、`app/reader`：两个入口与宿主适配；`app/bootstrap` 注册共享任务适配器。
- `features/workbench`：书桌、文献库、阅读器标签、设置、笔记。
- `features/credentials`、`glossaries`、`settings`：工作台复用的配置和术语表逻辑。
- `features/reader`、`jobs`、`ingest`：阅读器及设置需要的上游 domain 适配。
- `platform`：API、存储、配置、导航、协议及可选离线 mock。
- `ui`：工作台控件、类名工具和共享 hook。
- `styles`：工作台样式与阅读器 CSS 代理；`assets`：仍被两个入口引用的静态资源。

依赖方向：app → features → platform，ui 旁挂。跨功能只经 index/domain 出口；domain 不依赖 React。
源码文件必须可从两个入口经运行时、类型或样式导入到达，详见 `scripts/audit-entry-reachability.mjs`。
