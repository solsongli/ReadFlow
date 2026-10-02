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


## Apple 风格改版（T1）

完成日期：2026-10-01。

- 独立 Apple 视觉令牌：浅色内容白底、灰色侧栏、蓝色强调；深色为 macOS 灰阶。深色主按钮采用深色文字以满足对比度，系统 / 浅色 / 深色继续可切换。
- Inter 正体及斜体通过本地 `@font-face` 加载，中文回退 `Noto Sans CJK SC`；基础字号 13px。产物字体 URL 为 `../../src/assets/fonts/inter/InterVariable.woff2` / `../../src/assets/fonts/inter/InterVariable-Italic.woff2`（两条独立声明），仓库直服与 prepare 的 `dist` + `src/assets` 拷贝结构均已验证。
- 外壳：全高 236px 侧栏（可收起为 52px 图标栏并持久化）、52px 工具栏、360px 详情；常驻标题栏和底部状态栏移除。打开阅读器后才出现紧凑标签条，侧栏仍可导航。
- 工具栏：标题与筛选摘要、排序、显示、导入、实时搜索，以及有任务时的进度圆环。设置移入侧栏底部齿轮；Ctrl K 保留命令面板，`/` 聚焦当前列表搜索。
- 侧栏分组支持展开、文件夹图标、悬停 / 右键菜单、行内新建及改名、就地删除确认；拖入只加入分组。标签超过 8 个折叠，未分组计数为零时隐藏该入口。
- 文献列表：移除表头与列网格，题名 / 可选中文题名 / 作者出处年份与状态构成两到三行条目；紧凑为单行，分组视图保留重复成员与粘性标题。Ctrl / Shift 多选、J / K / 方向键、Enter、S、G、Del 保留。
- 详情：18px 标题、可编辑中文题名、作者与状态摘要、阅读和对照阅读、圆形操作按钮、分组胶囊、信息及引用卡片、默认四行摘要；批量面板同步更新。引用预览和复制引用命令收进引用区预览按钮，BibTeX 代码块继续使用等宽字体。
- 新增纯逻辑位于 `domain/presentation.ts`、`domain/import.ts`，偏好仍经原控制器保存。修复 G 键写入分组搜索框及中文输入法确认误触；撤销回调改存控制器实例内，避免状态容器 structuredClone 报错。
- 动效仅保留 150ms 的颜色 / 选中 / 悬停过渡，支持 `prefers-reduced-motion`。书桌布局、后端、旧三页源码及其 CSS 入口不改。

验证：

1. `node_modules/.bin/tsc --noEmit -p tsconfig.json`：退出码 0，0 个错误。
2. `npm run build`：退出码 0。仅保留工作台产物及 `workbench.html` 自动生成的资源缓存串；旧页构建副产物已恢复为接手时内容。
3. 指定 architecture + workbench 测试：124 项，120 通过、1 跳过、3 失败；失败仍仅是 PdfReader 阻塞对话框、research-library.css 命名空间、OcrPanels 跨功能引用。工作台测试 21/21 通过。
4. `node tests/workbench/apple-smoke.mjs`：17 个离线浏览器场景通过，0 个页面错误，正体 / 斜体 2 个字体加载成功。覆盖主题、侧栏偏好、标签折叠、搜索 / 排序、双语 / 紧凑 / 分组、多选与快捷键、拖拽、分组操作、行内编辑、引用、回收站撤销、阅读器标签、命令面板、导入、任务圆环和减少动效；检查了 1440px 与 1100px 宽度。

离线测试用内存 API、拦截全部浏览器请求，不启动服务、不接触现有预览或真实文献库。入口脚本和测试数据在 `tests/workbench/apple-smoke.mjs`、`apple-fixture.tsx`；截图在 `/tmp/readflow-t1/screenshots/`，验证日志在 `/tmp/readflow-t1/`。

与静态图的差异：保留齿轮、计数与可移出分组的胶囊按钮；完整信息字段比示意图更多，详情可独立滚动；引用预览为弹出层。阅读器继续复用旧 iframe，「对照阅读」暂与「阅读」相同；真实后端 / 预览集成由验收方确认，T2 书桌重排未实施。


## 打包（T7）

完成日期：2026-10-01。Linux x64 离线交付包：ReadFlow 0.9.0。

- 品牌来源为 `frontend/desktop/package.json` 顶层 `productName`，`src/main/brand.js` 统一供窗口、托盘、启动页和错误对话框使用；appId 为 `app.readflow.desktop`。
- Linux 系统包名/命令为 `readflow`，安装目录 `/opt/ReadFlow`；npm workspace 的 `retain-pdf-desktop` 标识保留，以兼容根目录现有脚本。
- 打包版默认首页 `workbench.html`；`RETAIN_PDF_START_PAGE=index.html` 可覆盖，未知入口使用默认页，缺工作台页时回退 `index.html`。打包脚本另行强制检查工作台 HTML、JS、CSS 存在。
- 默认 userData、Chromium 会话数据均为 `~/.config/ReadFlow`；文献库在其 `data/research-library/` 下。不读取、不迁移 `~/.config/RetainPDF` 的库或设置。
- 显式隔离预览保留启动器自己的 XDG 目录与 Chromium 路径、首页和能力开关；未改启动器，也未操作预览目录/进程。
- 打包版不回收、不复用其他实例的后台端口；自动寻找空闲端口并为各服务分别保留，避免影响已启动的旧版。
- 图标：`frontend/desktop/build/readflow/readflow.svg`，以及 16、24、32、48、64、128、256、512、1024 PNG；`assets/readflow.png` 用于预览兼容，托盘优先用 16px 文件。Pillow 重生成脚本为 `scripts/generate-readflow-icons.py`。
- Web 素材只新增 `frontend/web/src/assets/readflow-logo.svg`；未接入页面，未运行 web build/test。

打包入口：`npm --prefix frontend/desktop run dist:readflow-linux -- --skip-web-build`。
本次实际执行：`node frontend/desktop/scripts/package-readflow-linux.mjs --skip-web-build`。

1. 跳过 web 构建，复制已有产物；`package-report.json` 保存工作台 HTML/JS/CSS 的 SHA256，界面任务完成后应重新封包。
2. `prepare-app.mjs` 成功；已补入工作台/文献库页面，默认 OCR 改为 local。复用已有 retainpdf2doc 的 dist、三个 Rust 二进制、Python、Typst；未运行 build:doc/cargo，无功能裁剪。Python import 与 pipeline CLI 帮助探测通过。
3. 检查 `app/backend/research-library/library_mvp/api.py` 和 `native_library_service.py` 通过（library_mvp 是 namespace package，不要求 __init__.py）。
4. `electron-builder --linux dir` 成功；直接读取本机 Electron 44.4.3 zip，缓存写目录限定在 `dist-readflow/.cache/`，没有下载依赖。输出 `dist-readflow/linux-unpacked`。
5. `linux-runtime.mjs --check` 通过：63 个 ELF，最高 GLIBC 2.34，上限 2.35；未启动应用。
6. `fakeroot dpkg-deb --build` 成功；dpkg 1.21.1 不支持新版线程参数，脚本使用兼容的环境变量。deb 为 root/root 属主，包含 Office/Education/Science 菜单分类和 hicolor 图标；postinst 设置 chrome-sandbox root:root/4755。

验证：`npm --prefix frontend/desktop test` 的 lint 和 64 项单测全过，无跳过；`dpkg-deb -I/-c` 已检查。
ASAR 的 `package.json` 为 productName=ReadFlow、version=0.9.0，最终壳源码与 ASAR 一致；未打包 runtime-config.local.js。
产物：`frontend/desktop/dist-readflow/readflow_0.9.0_amd64.deb`。
大小：228660576 bytes（218.07 MiB）；Installed-Size 729692 KiB。
SHA256：`e41466438d6e1e6944e3c5a56eb73983d7746cd592f214b75b068261ac973fb4`。
机器可读记录：`frontend/desktop/dist-readflow/package-report.json`。

默认能力（不设置任何环境变量；结论来自壳单测、服务路由核对与打包资源检查）：

- 文献库：默认开启。
- OCR：默认允许界面明确安装动作；启动不下载。安装接口要求用户确认当前固定清单的 preview_hash，流水线禁止自行下载缺失模型。
- 模型：将桌面传给文献库服务的 `RETAIN_PDF_ALLOW_EXTERNAL_MODELS` 默认值补为 1，让用户配置后的主动请求可用；空配置不调用，启动只启动本地服务。显式 0 仍禁用，预览启动器的选择保持有效。

验收重点：全新配置下的工作台首启、托盘图标/标题、关闭到托盘、与已启动 RetainPDF 并行、数据目录分离、OCR 点击前后行为、模型未配置时无调用。
尚未安装 deb 或启动打包应用；postinst 与目标系统 sandbox/桌面集成需由验收方运行确认。当前包包含已有 web 构建快照，旧页面/favicon 的新品牌接入仍由界面任务完成。
旧 `frontend/desktop/linux/` 产物保持原样；未联网、安装依赖、提交或推送。


### T7 验收修订（2026-10-02）

- 新增 `src/main/backend-processes.js` 与 `desktop-shutdown.js`：SIGTERM/SIGINT/SIGHUP 和托盘退出共用异步清理；直接子进程立即登记，并每 100ms 跟踪 Rust 各线程的后代，包括 AI、jobsd 与 Python worker。
- 登记文件为 `userData/run/backend-pids.json`，0600、原子写入；先获取单实例锁，再核对 boot ID、安装根目录、PID、/proc 第 22 列启动时间与实际 executable。只终止同一 resources/backend 下验证通过的进程，先 TERM，2.5 秒后仍存活才 KILL；升级信号前再次核对身份。
- 不清理未登记进程；损坏记录、PID 重用、路径不符或其他安装/系统启动的记录均不授权终止。异常退出后保留的已登记后代在下次启动清理。
- 图标改为两页各三条水平文字行（左深蓝、右浅蓝）和细书脊线，移除页下弧线；九种 PNG、预览 PNG 和指定 web SVG 均已同步。
- deb 所有目录（含 ./）为 0755，普通文件 0644，可执行文件及 .so 为 0755；chrome-sandbox 在包内为 0755，安装后由 postinst 设置 4755。
- 新增 `/usr/share/doc/readflow/copyright`（ReadFlow 说明、根 LICENSE 的完整 MIT 文本、Inter OFL 说明），附 `Inter-OFL.txt`。Electron/Chromium 原许可保留；`resources/default_app.asar` 已移除。
- Maintainer 为 `Lsy-aia <ZahnenClineman53@outlook.com>`，Homepage 为 `https://github.com/Lsy-aia/ReadFlow`；package.json author 保留上游。
- lint 与 83 项桌面测试全过（含真实临时 helper 的孤儿恢复测试）；未运行打包应用或安装 deb。实际以 `--skip-web-build` 重新封包，运行时 ABI 检查仍为 63 ELF、最高 GLIBC 2.34。
- 当前同路径交付包已更新：228521904 bytes（217.94 MiB），SHA256 `f3ad7cc5fa07fd8d373a7d79d951706af64a944ae7683dd257baeb9d8e2577fe`。本行摘要对应当前产物。

## 书桌仪表盘（T2）及 T1 收尾

完成日期：2026-10-02。

- 书桌采用浅灰底、白色（深色为灰阶）小组件、六个彩色功能图标。标准窗口六入口一行，窄窗口自动换行；12 列网格按 8/4、6/3/3 排列，较窄时重新分行，组件有独立空状态。
- 六入口：翻译 PDF、AI 伴读、导入文献、本地 OCR、笔记、术语表。翻译与 AI 均先搜索/选择文献，再打开原阅读器标签；没有新增翻译提交接口、没有自动模型调用。导入复用原 PDF / Zotero·CSL JSON 菜单。
- OCR 通过现有 `GET /api/research/ocr/modules` 检查 ready，再向现有 `POST /api/research/ocr/jobs` 提交所选附件；提交前复核就绪状态和现有任务，跳过排队/运行中的附件。不调用安装、下载接口；未就绪展示原因与旧版设置入口，失败可重试。
- 旧版首页没有 `settings=glossary` 这类参数。术语表/OCR 设置使用同源 `index.html?tab=library` 兼容弹出层，通过既有 `#app-settings-btn` 及 `[data-settings-tab="glossary"|"api"]` 控件打开设置；术语表标签按旧页 Radix 契约派发 mousedown，并确认 aria-selected。未改旧页面。自动定位失败时提供旧页入口。
- 小组件：三张继续阅读卡片（真实进度或“进度待同步”）、全库翻译摘要、三条最近批注（衬线引文）、待读、文献库概览。仪表盘组件中的进度、批注和操作使用中性色；侧栏沿用 T1。
- `desk` 保留原字段并增加 `counts` 与 `translation`。翻译状态覆盖全部未删除、有附件的文献，沿用 20 秒 TTL 与并发查询；失败为 unknown，不计入已译。最近完成按任务 `updated_at` 的实际时区排序；无有效时间则返回 null。
- `counts.notes` 为独立笔记条数，`counts.annotations` 为批注条数。列表 `view=notes` 及其计数表示有任一种记录的文献篇数；其余新视图为 `needs_ocr`（首附件状态）、`missing_doi`（排除 note 类型）、`no_zh_title`。均排除回收站、可继续叠加搜索/分组等筛选。
- 侧栏新增“有笔记”，零计数隐藏；概览和命令面板可进入其他新增视图。列表外的文献通过按 ID 加载详情取得正确附件，避免选择器/最近批注误用当前详情附件。
- T1 收尾：元数据全空不输出“—”；中文题名占位使用 text-3，悬停/键盘聚焦显示铅笔；命令各用对应图标，快捷键仍为 Ctrl；列表日期采用 Mail 文案，按本地日历计算并覆盖夏令时与跨年边界。

验证：

1. 指定 Python 环境执行 `backend.library_mvp.tests.test_workbench`：14/14 通过。
2. 核心 12 模块：201/201 通过。模块为 `test_api`、`test_store`、`test_zotero`、`test_connector`、`test_evidence`、`test_native_bridge`、`test_native_annotations`、`test_optional_ocr`、`test_pdf_transaction_hook`、`test_agent_service`、`test_research_extensions`、`test_workbench`。
3. `node_modules/.bin/tsc --noEmit -p tsconfig.json`：退出码 0，0 错误。
4. `npm run build`：退出码 0。仅保留工作台 CSS、bundle 与 workbench.html 缓存串；旧页构建副产物恢复到本轮接手内容。
5. 指定 architecture + workbench 测试：134 项，130 通过、1 跳过、3 个已知失败；仍为 PdfReader 阻塞对话框、research-library.css 命名空间、OcrPanels 跨功能引用。工作台 31/31 通过。
6. 离线浏览器：`node tests/workbench/desk-smoke.mjs` 14/14，T1 `apple-smoke.mjs` 17/17；页面错误均为 0。覆盖六入口、OCR 就绪/未就绪/已排队/失败重试、旧版设置控件契约、筛选、T1 收尾、空库、错误恢复，以及 1440 / 1100 / 900px 浅深色布局。

日志与截图：`/tmp/readflow-t2/`。离线测试全部使用内存 API 与拦截响应，未访问真实库或模型，也未启停预览。仅按任务要求执行预览目录内的 Python 解释器，并禁用字节码写入。真实旧页/后端服务集成由验收方更新服务后核验；术语表兼容层依赖旧页已有按钮与标签契约。


### T7 预览路径回归修复（2026-10-02）

`brand.js` 已移除 offlinePreview 数据路径分支。存在 `app.commandLine.hasSwitch("user-data-dir")` 时，保存并核对 setName 前后的 userData，保留 Electron 选定的 userData/sessionData，不调用 setPath；仅无开关时设置 appData/ReadFlow。mkdirSync 只调用最终目录。
已运行桌面 lint 与 85 项测试，全部通过；使用 `--skip-web-build` 重新封包，ASAR 已核对包含最终修复。未操作实际预览目录或误建空库，未修改 web/reader。
当前 deb 为 228534620 bytes，SHA256 `569c5eb5da7c257ac7522116ee7adcd2294479128d9707f5fc8aaef62a267b7d`。

## 阅读器嵌入（T3）

完成日期：2026-10-02。继续使用现有 react-pdf 阅读器，仅接入工作台嵌入协议。

- ReaderHost 为同源 reader URL 增加 `embed=workbench`、实际生效的 `scheme=light|dark`，绑定当前标签的 `research_item_id`。iframe 地址在挂载后保持不变，主题切换通过消息发送给所有已打开标签；系统主题变化也会同步。
- 嵌入时隐藏右上角关闭按钮；原 `retainpdf:soft-reader-close` 消息仍可关闭对应标签。独立 reader 与旧主页软打开没有 embed 参数，继续使用原主题存储、事件与关闭按钮。
- 嵌入主题不读取/写入 `retainpdf.theme`，不广播 `retainpdf:theme-change`。浅色使用 classic，深色使用新增 graphite；PDF 纸张保留白色，无反色。graphite 只在阅读器包登记，旧设置外观面板不新增该项，web 主题文件及 workbench.css 均未改。
- UI 字体使用现有 Inter 字体文件，注册为独立的 `ReadFlow Inter` 字体族，再回退 Noto Sans CJK SC；仅作用于工具栏、页码条、辅助面板标题等界面区域，避免覆盖 PDF/译文自身字体。
- 跳页使用现有 **0 基 `page_idx` 查询锚点**：数据库/消息的 1 基 `read_page=6` 转为 `page_idx=5`。URL 锚点落定后才开始上报，避免启动时第 1 页覆盖保存页码。翻页按约 1 秒尾随节流，保存请求按文献串行、合并待处理页码。
- **接口契约差异**：现有 PATCH `/workbench/items/{id}/state` 的白名单没有 read_page/read_pages，发送会被拒绝；遵照“不改后端”，复用现有 POST `/workbench/items/{id}/opened` 的 `{page,pages}`。它保存进度，并只把 unread 改为 reading。打开与翻页的回执均单行合并，不触发整表刷新；书桌继续阅读同步更新。
- 批注成功新建/编辑/删除后发通知；父页读取该文献的工作台行，更新笔记/批注数，当前选中详情也重读，并刷新书桌批注摘要。失败的持久化请求不发送通知；并发进度回执不会覆盖刚更新的星标或笔记数。

最终消息协议：

- 父 → 子：`{type:"readflow:scheme", scheme:"light"|"dark"}`。
- 子 → 父：`{type:"readflow:reader-ready", itemId}`（就绪握手，父页补发最新 scheme）。
- 子 → 父：`{type:"readflow:reader-progress", itemId, page, pages}`，页码均为整数、1 基，`1 <= page <= pages <= 100000`。
- 子 → 父：`{type:"readflow:notes-changed", itemId}`。
- 子 → 父：`{type:"retainpdf:soft-reader-close"}`，复用包内 SOFT_READER_CLOSE_MESSAGE。
- 双方核对 origin 与自身 location.origin 完全一致；子页额外核对 source 为 parent，父页核对 source 为自己登记的对应 iframe。带 itemId 的消息必须是对应标签的 UUID；类型、字段及数值范围由共享 domain 纯函数校验，额外字段不接受。

验证与基线：

1. reader 包 `typecheck`、`build` 均退出码 0；包没有单独 test 脚本，已有 reader 测试随 web 组合运行。
2. web `tsc --noEmit -p tsconfig.json`：退出码 0、0 错误；`npm run build`：退出码 0。
3. 原始基线有额外 11 个 reader-package-boundary 失败，均来自 npm pack --dry-run 不能写默认 npm 缓存（EROFS）。用 `npm_config_cache=/tmp/readflow-t3/npm-cache npm_config_offline=true` 重跑，基线为 694 项：690 通过、3 已知失败、1 跳过。
4. 同样的 architecture + workbench + reader 组合最终为 **711 项：707 通过、3 已知失败、1 跳过**；仅余 PdfReader 阻塞对话框、research-library.css 命名空间、OcrPanels 跨功能引用。新增嵌入逻辑/运行时用例 17 项通过。
5. 实际 reader bundle + 合成 8 页 PDF + 本地拦截 API：`node tests/workbench/reader-smoke.mjs` **8/8**，页面错误 0，未处理/外网请求 0。覆盖真实翻页续读、PDF 白底像素、UI 字体、主题不重载、原生批注创建/编辑/删除、来源拒绝、逐标签关闭与独立 reader 保持旧皮肤。另核对隐藏/恢复标签后第 6 页仍保持。
6. T1 文献库浏览器回归 **17/17**、T2 书桌回归 **14/14**，页面错误均为 0。

日志及截图：`/tmp/readflow-t3/`。未启停或访问真实预览，未操作 `.retain-native-preview/`、后端或 `frontend/desktop/`。仅保留 reader 包 dist、web reader/workbench 产物与对应 HTML 缓存串；旧首页/详情构建副产物恢复到本轮接手内容。真实旧阅读器原文/译文布局与真实库进度由验收方核对。

## 设置（T4）

完成日期：2026-10-02。

- 工作台主区新增通用、翻译、本地 OCR、AI 伴读、术语表、文献库、关于 ReadFlow 七类设置；左侧彩色小图标、右侧圆角分组行。通过齿轮菜单、`Ctrl ,`（阅读器内也可用）及命令面板进入，完成后返回原视图/阅读器实例。主题、列表密度、启动视图沿用 workbench prefs；未引入另一份配置存储。
- 书桌术语表与 OCR 设置入口直接打开对应分类；删除旧设置 iframe 兼容层与失效的 `?settings=api` 跳转。齿轮菜单仅保留设置、主题快速切换、打开旧版。工具栏导入“+”与排序、显示按钮统一 28px 尺寸及垂直居中。
- 新增 `credentials/domain/headless-translation.ts`：读取经 `loadPersistedConfig`、`loadBrowserStoredConfig` / `loadDeveloperStoredConfig`，由原 `createTranslationProfiles` hydrate/apply；保存经原 `createBrowserCredentialSaveFlow.handleSave`，最终仍是 `savePersistedBrowserStoredConfig` 与 `savePersistedDeveloperStoredConfig`（桌面沿用同一 IPC/快照）。保留服务独立配置、留空保留已有凭据及其他任务选项。
- 检测按钮复用原 `runDeepSeekConnectivityCheck` → `validateDeepSeekToken`，仅点击时发一次小请求；保存不检测、不请求模型，不自动查询余额。页面明确说明检测会请求所选服务。为满足跨功能入口门禁，只在 `features/credentials/domain.ts` **追加**新端口导出，这是允许目录之外的必要公开出口改动；旧函数/行为不改。
- 翻译与 AI 的 API Key/Gateway Key 默认遮罩；只能主动点“显示”，失焦、窗口失焦、页面隐藏、切换分类均恢复遮罩。反馈会隐藏已知凭据内容，阅读器通知及测试日志不含凭据。
- AI 伴读完整保留三种运行方式、两种确认模式、模型/Gateway 字段、版本冲突与重启等待，新增薄端口继续使用 `fetchAgentRuntimeConfig` / `updateAgentRuntimeConfig`；可主动填入翻译配置。保存后将现有无载荷 `retainpdf:credentials-changed` 通知转发到同源阅读器文档，不重载标签，不改 T3 消息协议。
- OCR 复用现有 modules/preview/install/remove/cancel 接口。安装前展示 preview 返回的来源域名和下载大小；二次确认后才带 `preview_hash` 提交安装，下载开关关闭时如实解释。移除也需就地确认，支持下载中取消；仅查询模块状态不触发安装。
- 术语表复用公开的 `createGlossariesViewFeature`、`mountGlossariesFeature`、`useGlossariesController`，支持新建/编辑/删除确认、增删行、匹配规则/备注、CSV 文件或粘贴导入及导出。启用态沿用旧 `developerConfig.glossaryId`，一次一个默认术语表；删除当前默认后清空该选择，不另建启用存储。
- 文献库统计覆盖全部未删除文献、附件、笔记与批注、分组；导入复用现有流程，成功后重读统计。现有后端没有永久清空回收站接口，因此仅提供查看与恢复入口，没有实现清空。
- 关于页使用现有 ReadFlow SVG；优先读取桌面桥的 `appVersion`/`version`，没有注入时显示“开发版”。显示根 LICENSE 的 MIT License、Inter OFL 本地许可链接及旧版入口；未改桌面壳。
- 未迁移：旧皮肤选择由工作台明暗偏好替代；上游 Release 检查不属于 ReadFlow 发布渠道；服务商文档/充值与余额附加查询不纳入新设置。原任务选项（如公式模式）保存时保留，不新增界面控件。旧设置本身保持原样。

验证：

1. `node_modules/.bin/tsc --noEmit -p tsconfig.json`：退出码 0，0 错误；`npm run build`：退出码 0。仅保留工作台 CSS、bundle、workbench.html 缓存串，旧页构建副产物恢复到 T4 接手内容。
2. 接手基线 architecture + workbench + credentials 为 162 项：158 通过、3 失败、1 跳过。没有 `tests/glossaries` 目录；实际术语表测试位于 home，另跑 13/13 通过。合计基线 175 项，171 通过、3 失败、1 跳过。
3. 最终相同范围连同三份 home 术语表测试：**188 项，184 通过、3 失败、1 跳过**。仅原三项：PdfReader 阻塞对话框、research-library.css 命名空间、OcrPanels 跨功能引用。新增端口、导航偏好、遮罩与术语表逻辑测试 13/13 通过，测试凭据均为假数据。
4. `node tests/workbench/settings-smoke.mjs`：**15/15**，0 页面错误、0 未处理/外网请求；覆盖七类设置、默认遮罩/失焦、同一桌面持久化流程、主动检测、OCR 确认/禁用、AI 配置与冲突、术语表 CRUD/CSV、文献导入、版本/许可、快捷键、阅读器通知和返回、工具栏对齐。
5. T1 文献库 **17/17**、T2 书桌 **14/14**、真实 reader 包与合成 PDF **8/8**，页面错误均为 0。阅读器并行首跑在批注按钮等待稳定时超时，单独重跑通过；没有因此修改阅读器源码。
6. 检查浅色、深色、1000px 窄窗口截图，位于 `/tmp/readflow-t4/screenshots/`；日志位于 `/tmp/readflow-t4/`。浏览器请求全部拦截，未联网、请求真实模型、安装 OCR、访问真实凭据/文献库或启停预览；真实配置与下载由验收方按需验证。

## 笔记（T5）

完成日期：2026-10-02。

- 新增 `workbench_notes.py`，经现有 `register_workbench_routes` 注册 `GET /api/research/workbench/notes`。支持 `item_id`、`q`、`kind=all|notes|annotations`、`limit`（默认 200，范围 1–1000）及用于完整导出的 `offset`。返回 `{items,total,counts:{total,notes,annotations}}`；条目包含任务指定字段，`kind` 为 `note|annotation`。counts 反映文献/搜索过滤结果，尚未叠加类型过滤；total 为全部过滤条件命中的条数。
- 查询排除回收站，按 `updated_at DESC,id DESC` 稳定排序，正文/引文/译文引文/中英题名支持 Unicode 大小写折叠搜索。统计与过滤在 SQLite 内完成，仅将当前页记录载入 Python；不返回 raw_source_json 或批注内部结构。
- **批注一致性**：前端仍发原 `PATCH /api/research/notes/{id}` 的 `{body}`。现有 `Store.update_note` → `_native_annotation_json` 在同一事务内从已保存批注构造 `{...previous_annotation, quote:value.quote, note:value.body}`，再完整校验原始 PDF、身份、页码、quote/note 一致性。没有修改 store.py、没有放宽 ANNOTATION_TEXT_MISMATCH，也未新设绕过校验的写入接口；选区几何、颜色、原引文均保留。
- 顶层“笔记”进入两栏空间：300px 列表、搜索/类型分段、今天/昨天/过去 7 天/更早粘性分组，右侧为 17px 正文字体的 Markdown 编辑器。批注带衬线引文、颜色竖条、页码与阅读器入口；复制正文 Markdown、就地删除确认、空状态及新建入口齐备。
- 新建复用 T2 文献选择器，允许无 PDF 的文献；当前可见笔记空间有文献过滤时直接建稿。侧栏/命令面板/`Ctrl N`/书桌/详情入口已接通，隐藏的旧过滤不会把其他视图新建的笔记归到错误文献。详情“引用”之前展示最近三条及新建/查看全部操作。
- 存储层拒绝纯空白自由笔记，因此新建先聚焦空草稿，首次有效输入后才调用原 POST notes 接口，不写占位文字。已保存的自由笔记清空正文会提示无法保存，可通过删除操作移除；未改原 100k 字符上限。
- 自动保存停输约 800ms；写请求串行，保存期间的后续输入继续保存，旧回执不覆盖新正文。切笔记/筛选、切主视图、设置或阅读器前等待保存，失败保留草稿并可重试；窗口离开/隐藏会尝试保存，仍有未保存内容时启用 beforeunload 保护。
- 预览使用本地 `vendor/marked` 的独立实例。domain 渲染器转义全部原始 HTML；链接仅允许 http/https/mailto，加 `noopener noreferrer`；Markdown 图片只显示替代文字，不隐式请求图片。导出按文献分节、批注带 1 基页码，遍历所有分页，不将当前加载的 200 条或 API 单页上限误当成导出上限。
- 笔记增删改沿用 T3 统计刷新路径更新文献行、当前详情及书桌；接到阅读器 notes-changed 时，正在显示的笔记列表也刷新，保留尚未保存的本地输入。批注跳页沿用 0 基 `page_idx` URL 锚点，并使用该批注的附件；显式跳页会重新挂载对应阅读器，普通标签切换保持实例。
- 统一计数：侧栏“有笔记”改为“有笔记的文献”（篇）；概览分别显示“笔记 N 条 · 批注 M 条”；笔记空间按条统计，顶层徽标为两者合计。无引文但有实际页码的选区批注也归入批注，列表、书桌和笔记接口口径一致。

验证：

1. 接手 architecture + workbench 基线 **164 项：160 通过、3 已知失败、1 跳过**。最终相同范围 **181 项：177 通过、3 已知失败、1 跳过**；新增 17 项纯逻辑/保存队列测试通过。失败仍仅为 PdfReader 阻塞对话框、research-library.css 命名空间、OcrPanels 跨功能引用。
2. `node_modules/.bin/tsc --noEmit -p tsconfig.json`：退出码 0，0 错误；`npm run build`：退出码 0。仅保留工作台 bundle/CSS 和 workbench.html 缓存串；无关旧页构建产物恢复到 T5 接手内容。
3. 后端新增 `test_workbench_notes` **7/7**（过滤/搜索/回收站/原生批注一致性与拒绝错误载荷/自由笔记 CRUD 与上限/分页/计数）。核心 12 模块加此模块共 **208/208**。默认 Python 缺 httpx，未安装依赖，使用已有打包 Python 并禁用字节码写入；测试库均在临时目录。
4. 离线笔记浏览器 **15/15**，页面错误/未处理请求均为 0；覆盖自动保存与失败留稿、PDF 页码、阅读器通知、详情联动、新建焦点、Markdown XSS、剪贴板假端口、分页及 1005 条完整导出。已检查浅色/深色、1440px 与 1000px 窗口。
5. 文献库 **17/17**、书桌 **14/14**、设置 **15/15**、真实 reader bundle 与合成 PDF **9/9**，页面错误均为 0。旧 reader 自测首跑仍遇到锚点重试清除选区的时序问题；测试改为等待跳页稳定后的首条进度回报，并增加已有标签按笔记锚点跳页检查，最终通过；阅读器包/旧宿主源码未改。

日志与截图：`/tmp/readflow-t5/`。没有访问真实文献库/凭据、调用模型、联网安装依赖、提交或启停预览；没有修改桌面壳。真实预览需由验收方加载新增后端路由后核对。内部导航等待保存；强制退出或进程崩溃不等同于服务端已确认保存。旧阅读器没有接收外部批注更新的订阅，普通切回已开的标签仍沿用其缓存；从笔记的“在阅读器中打开”入口重开后会读取最新批注。

### T4 验收修订：运行时配置与 AI 读取提示

- 翻译端口改为复用旧页的 `createDeveloperConfigResolver` / `resolveWorkflowDefaults`、`defaultModelName` / `defaultModelBaseUrl` / `defaultModelApiKey` 与 `createCredentialDialogFlow.syncBrowserDialogFromCredentialState`，使服务识别、配置优先级、URL、模型、Key 和并发与旧对话框一致。`ingest/domain.ts` 仅增补这两个原有默认值函数的公开导出，避免跨功能深入引用；旧实现不改。
- 已有 Key 时显示灰色“已配置”，输入仍默认遮罩，显示/失焦/切页行为沿用 SecretField。测试断言 Key 存在或相等只输出布尔值，不记录具体内容。
- 保存继续走 `createBrowserCredentialSaveFlow.handleSave` → 两个 `savePersisted*StoredConfig` → `saveDesktopPersistedConfig` → 桌面桥 `saveDesktopConfig` / `save_desktop_config`。以临时目录和假配置调用实际桌面存储函数，确认落盘后的 `buildDesktopRuntimeConfig`（网关注入来源）包含新模型、URL、Key 与并发，且两次持久化均 await；失败不报成功，保存不检测。普通 Chrome 没有 Electron IPC 桥时，与旧页一致仅保存浏览器配置，不新增桌面写入 HTTP 接口。
- AI 读取的 502、503 与网络错误显示“本地 AI 服务未运行。AI 伴读需要它在后台运行；正式版启动时会自动开启。”，其余错误保留原提示；两类均为灰色并提供重试，不输出原始响应内容。
- 验证：tsc / build 均退出码 0；architecture + workbench + credentials 基线 192 项（188 通过、3 已知失败、1 跳过），最终 198 项（194 通过、同样 3 失败、1 跳过）。新增 6 项逻辑测试通过；设置离线浏览器 16/16，另加运行时独立注入与遮罩场景 1/1，页面错误、外网请求均为 0。日志位于 `/tmp/readflow-t4-fix/`；无关旧页构建副产物已恢复，未读写真实配置、调用模型或启停预览。

## 上线前打磨（T6）

- 空库以未删除文献总数判定。书桌和文献库共用居中欢迎页：现有 ReadFlow 图标、介绍、PDF / Zotero·CSL JSON 导入及翻译设置；隐藏空详情占位。回收站保留恢复入口，空回收站也不显示详情占位。书桌零处理项不再是链接，全为零显示“一切就绪”；待读组件区分无文献与已读完。
- 窗口拖放监听覆盖侧栏、菜单和同源阅读器 iframe，遮罩覆盖全窗；悬停展示已知 PDF 数，类型被浏览器保护时说明松开后检查，实际松开仅处理 PDF。混入其他文件会提示忽略。批量失败只重试未成功文件；上传成功但分组失败时继续加入分组，不再次上传。
- workbench.html 标题 / favicon 统一 ReadFlow；视图及阅读器切换更新 document.title。Ctrl /（含阅读器内）或命令面板打开快捷键一览，通用 / 文献库 / 阅读 / 笔记的数据集中于 `domain/shortcuts.ts`，菜单快捷键列共用定义。
- 根部 React 错误边界提供重新载入和复制诊断。诊断只保留标准错误类别、已知消息模板、组件类别及代码行列；任意原始消息、路径、URL/查询参数和未知组件名不复制，不附用户数据/配置。生产根不额外输出原始捕获异常。
- 本地文献 API 网络错误 / 5xx 显示工具栏下的灰色连接提示，保留已有列表；自动按 1/2/4/8/16/30 秒退避，常规轮询在断线期间暂停，恢复后重新读取当前视图并撤去提示。自动恢复只重读，绝不重放写操作。
- 写入失败统一进入可手动重试的 toast：文献状态/元数据/分组/回收站、PDF 与 JSON 导入、笔记、阅读进度、翻译/AI 设置、OCR、术语表、剪贴板和导出。失败保留编辑内容；toast 回调留在控制器实例中，不进入序列化 store。
- 文献列表按固定的双语/两行/紧凑行高及分组头建立偏移表，二分定位可见范围，仅挂载视口加上下 280px 缓冲；分组成员仍重复展示。粘性段头、折叠、Ctrl/Shift 多选、跨窗口键盘移动、拖入分组保留；后台刷新不会把手动滚动位置拉回选中行。搜索停输 180ms 后执行，并等待中文输入法组合结束。
- 无障碍：补齐图标按钮标签/悬停标题与长题名 title；焦点环覆盖输入框和弹出菜单。将文字链接颜色与主按钮强调色分离，提高深色次要文字、链接及危险操作文字对比度；常规正文、输入区和七类设置均进行浏览器对比度检查（不计禁用控件），阈值 4.5:1。

四个旧失败的最小修复：

1. `app/research-library/PdfReader.tsx` 用同目录已有 Dialog 组件承载删除确认，适配该独立页已有样式；取消不请求，确认后仍走原删除方法，不再阻塞浏览器。
2. `styles/pages/home/research-library.css` 为选择器添加 `:where(body:has(#home-root))`，覆盖主页正文及 portal 弹窗，同时不增加选择器优先级。
3. `credentials/ui/OcrPanels.tsx` 经 research-library 的 index 出口消费组件；该 index 只新增一行已有组件导出。
4. `tests/ingest/submit-flow-modules.test.mjs` 更新旧 OCR 云凭据文案断言：现有正确行为是翻译需要模型 Key，仅本地 OCR 不需要翻译凭据，实现不改。

验证与基准：

- `tsc --noEmit -p tsconfig.json`、`npm run build`：退出码 0。另执行 `node scripts/build-research-library.mjs`，使独立旧文献库产物包含非阻塞确认；未打包桌面安装器。
- `npm test`：**1978 项，1977 通过、0 失败、1 原有跳过**；跳过项为 RecentJobsLibrary 卡片交互的既有 CI 波动项。本轮新增窗口化、恢复、诊断与批量重试纯逻辑测试 12 项。全量基线的四个失败均已消除。
- `npm --prefix frontend/desktop test`：lint 及 **85/85** 通过；后端核心 12 模块加 T5 notes 模块 **208/208** 通过。
- `tests/test_workbench_performance.py` 为可选慢测试，默认跳过；显式 `READFLOW_BENCHMARK=1` 已跑 **1/1**。真实临时 SQLite 库含 2000 文献、2000 附件记录、2000 笔记、20 分组、4000 关系，经 ASGI 调用完整 GET /workbench/items；翻译状态为内存假数据，无外部查询。冷调用 **190.89ms**；后续 10 次均值 **133.78ms**、中位 **126.42ms**、最慢/p95 **168.04ms**。均低于 300ms，未修改后端实现；数值不包含外部翻译状态服务的网络耗时。
- 离线浏览器：上线打磨 **13/13**、文献库 **17/17**、书桌 **14/14**、设置 **17/17**、笔记 **15/15**、真实阅读器 **9/9**；页面错误均为 0。覆盖大库、欢迎页、拖放到 iframe、断线恢复、显式写重试、诊断脱敏、旧页确认取消/删除、快捷键、深色对比度和焦点。

日志与主要截图在 `/tmp/readflow-t6/`；设置各类别深色截图在 `/tmp/readflow-t4/screenshots/t6-dark-*.png`。所有数据为合成/临时数据；未读取真实凭据、调用模型、安装依赖、提交或启停预览。保留本轮工作台、旧主页样式/出口及独立旧文献库对应构建产物。真实验收重点为首次导入、系统文件拖放、服务中断后恢复、大库分组多选/拖拽，以及键盘全流程。
