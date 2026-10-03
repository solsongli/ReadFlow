# 工作台与阅读器：关闭后保留工作区

T11 后只保留工作台与阅读器。工作台通过同源 iframe 承载每个阅读器标签，URL 使用 `embed=workbench`；关闭标签卸载对应 iframe，不导航或刷新工作台。

- 入口：`frontend/web/src/features/workbench/ui/reader/ReaderHost.tsx` 与 `ReaderFrame.tsx`。
- 关闭兜底：`retainpdf:soft-reader-close`，父页校验同源和 iframe 来源后关闭对应标签。
- 独立阅读器：只有同源 `workbench.html` referrer 才回退历史，否则直接打开工作台。
- 旧主页的 history flag、软打开事件、宿主探测及任务替换跳转代码已经删除。
- 阅读位置、主题和批注联动继续使用 ReadFlow 消息协议，详见工作台规划 README 的 T3 与 T11 章节。
