# ReadFlow 工作台：阶段 1（外壳 + 文献库 + 分组 + 书桌）

记录日期：2026-10-01。接手方：Claude（接续 GPT 的 research-library-mvp 工作，见仓库根 `PRIVATE_HANDOFF.md`）。

## 目标与已确认的设计

用户目标：把 RetainPDF 改造成专业的科研辅助软件——Zotero 式文献管理 + 双语翻译 + AI 伴读 + 笔记，界面专业克制，不花哨。

设计定稿（私有画布，仅用户可见）：https://claude.ai/artifact/BcBzFj53DZjVwJZoqkuGtt 第三排「定稿」。

- 视觉：风格 B「仪器」——冷灰 + 青绿强调色（#0B7A68），元数据用等宽字体，标题栏居中 Ctrl K 命令栏，底部状态栏带快捷键提示；浅色 / 深色两套（跟随系统或手动）。
- 列表：每行中英双语题名（取自风格 A）；尚无中文题名时第二行显示「作者 · 出处 · 年份」。
- 书桌（取自风格 C 并按 B 风格优化）：继续阅读、最近批注、最近添加、需要处理、待读、后台任务、最近笔记。
- **分组**：原「合集」在界面上统一叫「分组」，后端仍是多对多的 `collections` / `item_collections`；一篇文献可在任意多个分组；列表有分组列与「按分组」视图（同一篇文献在每个所属分组下各出现一次）；拖到侧栏分组 = 加入（不移动）。
- 装饰皮肤（墨迹、江南、海崖等）不进入工作台；旧三页暂时原样保留。

## 运行

新入口 `frontend/web/workbench.html`。预览启动器已把它设为 Electron 首页（`RETAIN_PDF_START_PAGE=workbench.html`）；旧界面经标题栏「设置 → 打开旧版界面」进入。

```sh
# 在 VSCode 内的终端/代理里启动时必须去掉 VSCode 注入的 ELECTRON_RUN_AS_NODE，否则 Electron 以 Node 方式启动失败
env -u ELECTRON_RUN_AS_NODE -u ELECTRON_NO_ATTACH_CONSOLE \
  python3 ops/development/native_retain_preview.py restart --connector --allow-ocr-download
```

- 改了 `backend/library_mvp/*` 需要 restart（sidecar 启动时加载仓库代码）。
- 只改前端：`npm --prefix frontend/web run build`，再 `python3 ops/development/native_retain_preview.py prepare` 同步文件后刷新页面。
- 浏览器验收可直接打开 http://127.0.0.1:40061/workbench.html（Chrome）。

## 代码

后端（`backend/library_mvp/`，不改原 `items` 表、导入与回滚逻辑）：

| 文件 | 内容 |
| --- | --- |
| `workbench.py` | 新表 `item_state`（中文题名、出处覆盖、固定引用键、星标、阅读状态/进度、回收站）；列表读模型（筛选/排序/搜索/计数/分组含子分组计数）、书桌读模型、分组成员增删与删除分组（文献保留）、回收站 |
| `workbench_model.py` | 纯函数：引用键（Better BibTeX 风格，冲突加 a/b/c，可固定）、年份、出处推断（Connector/Zotero/CSL 原始记录，arXiv DOI 兜底）、搜索 |
| `workbench_translation.py` | 只读全文翻译状态：按附件 SHA-256 查原服务 `/api/v1/documents/{sha}/jobs`，归纳为 none/queued/running/done/failed，TTL 缓存 + 并发，失败降级为 unknown |
| `native_bridge.py` | 新增只读 `document_jobs()` |
| `api.py` | 注册 `/api/research/workbench/*` |

接口：`GET workbench/items`、`GET workbench/items/{id}`、`GET workbench/desk`、`PATCH workbench/items/{id}/state`、`POST workbench/items/{id}/opened`、`POST workbench/items/trash|restore`、`POST workbench/groups/{id}/items`（`{add, remove}`）、`POST workbench/groups/{id}/delete`。分组新建/改名沿用 `/api/research/collections`。

前端（`frontend/web/`，遵守现有分层与架构门禁）：

- `src/platform/contracts/workbench.ts`、`src/platform/api/workbench.ts`
- `src/features/workbench/domain/`：`citation.ts`（GB/T 7714、BibTeX）、`groups.ts`、`format.ts`、`workbench-store.ts`（纯 reducer）
- `src/features/workbench/state/controller.ts`：全部副作用（请求可取消、偏好持久化、撤销）
- `src/features/workbench/ui/`：shell（标题栏标签页、命令面板、状态栏、快捷键）、sidebar（分组树）、library（列表/按分组）、inspector（分组选择器、引用框、行内编辑）、desk、reader（旧阅读器以同源 iframe 作为标签页）
- `src/ui/wb/`：基础组件；`src/styles/themes/workbench.css`（唯一色值来源）、`src/styles/entries/workbench.css`
- 构建：`scripts/build-js-bundle.mjs`、`build-css.mjs`、`stamp-cache-version.mjs` 增加 workbench；旧三页 CSS 入口加 `@source not` 排除工作台源码，旧页面产物不混入工作台类名。
- 桌面：`frontend/desktop/main.js` / `src/main/desktop-windows.js` 支持 `RETAIN_PDF_START_PAGE`（仅允许 index.html / workbench.html，缺文件回退 index.html）；网关入口白名单加 `/workbench.html`。

快捷键：J/K 或 ↑/↓ 移动、Enter 打开阅读、G 加入分组、S 星标、Del 移到回收站、Ctrl K 命令、Ctrl 1 书桌、Ctrl 2 文献库、/ 搜索。

## 验证（2026-10-01）

- 后端：`backend/library_mvp/tests` 核心 12 个模块 197 项全部通过（含新增 `test_workbench.py` 10 项：多分组、子分组计数、删分组不删文献、回收站、状态校验、引用键冲突与固定、书桌、翻译状态归纳与缓存）。
- 前端：`tsc --noEmit` 通过；完整 `node --test` 1888 项中 1882 通过、2 跳过、4 失败——4 项均为接手前已存在、与工作台无关：
  1. `src/app/research-library/PdfReader.tsx` 使用浏览器阻塞对话框；
  2. `src/styles/pages/home/research-library.css` 选择器缺页面命名空间；
  3. `features/credentials/ui/OcrPanels.tsx` 跨功能直接引用 research-library 内部组件；
  4. `tests/ingest/submit-flow-modules.test.mjs` 期望旧的「OCR Provider 凭证」提示，而本地 OCR 改造后提示已变。
- 桌面：`npm --prefix frontend/desktop test` 52 项全部通过。
- 界面（headless Google Chrome，隔离预览库）：书桌、文献库、给 SafeVLA 勾选三个分组、中文题名行内编辑、按分组视图、分组筛选、命令面板、深色主题、阅读器标签页、读后书桌「继续阅读」共 10 步通过；新界面无 pageerror。SafeVLA 的全文翻译状态从原任务服务读出为「已译」。
- 测试用数据：为验收在隔离预览库新建了分组「具身智能 · VLA / 安全对齐」「毕业论文 / 第二章 相关工作」「组会 10-08」，并为 SafeVLA 填写中文题名；均为合成或公开论文数据。

## 已知限制 → 后续阶段

- 阅读器仍是旧阅读器（在标签页内），阅读进度未回传 → 阶段 2 新阅读器（目录/批注/缩略图侧栏、高亮工具、进度回传）。
- 笔记仍是旧的摘录笔记 → 阶段 3 Markdown 笔记编辑器。
- 翻译状态只读；中文题名需手填 → 阶段 4 翻译整合（一键翻译、题名翻译、对照视图同步滚动）。真实模型调用需用户授权与预算。
- AI 伴读 → 阶段 5（需用户授权模型与预算）。
- 设置仍走旧界面；旧页面与装饰皮肤尚未下线 → 阶段 6。
- 未做：列表虚拟滚动（数千篇时再做）、清空回收站（永久删除）、DOI 在线补全。
