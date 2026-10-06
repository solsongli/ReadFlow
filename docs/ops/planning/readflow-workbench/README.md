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


## 移除旧版界面（T11）

只保留 `workbench.html` 与 `reader.html`。实际删除四个旧 HTML（index/detail/research-library/studio）、旧 app/home/detail/research-library、studio 原型、旧 CSS 入口、对应 dist 产物及 UI 入口；不以重定向或隐藏保留旧页面。

- 删除旧专属 features：library、book-detail、job-detail、ask、collections、favorites、app-update、task-center、research-library、artifacts；精简 credentials、ingest、jobs、reader、settings、glossaries 的旧 UI/转发出口。
- 删除 web 旧 ui/theme、装饰与动画、未引用的 platform 模块及 web 旧皮肤；删除 packages 中不可达的 UI 原语、API、domain、reader 转发出口和样式。
- 保留凭据保存/默认值链、术语表 CRUD、译文字体存储、导入状态和任务下载模型；阅读器宿主直接注册共享 job 适配器，不再加载旧 shell。
- Reader 独立返回目标为工作台；iframe 关闭消息保持原协议。包内皮肤仍由 Reader 样式与主题注册器使用，不能按“旧页面皮肤”误删。
- 桌面启动/回退只有工作台；网关拒绝其他 HTML，即使磁盘有陈旧文件。prepare、打包检查和预览复制清单一致；预览 prepare 清理旧 HTML 和旧 dist，不涉及 profile/data。
- 开发静态预览与 Docker 默认文档也改为工作台。未修改后端服务、翻译/OCR/Rust、许可证、MIT 版权、桌面 copyright 生成规则和“关于”的上游说明。

可复现审计：在 frontend/web 运行 `node scripts/audit-entry-reachability.mjs /tmp/readflow-audit`。以两个入口生成 esbuild metafile，补齐 TS 类型引用与递归 CSS import；447 个运行时项目输入、509 个源码/样式节点，不可达源码为 0。新增架构门禁锁住两入口和可达性。

规模（同一统计口径，排除 node_modules/dist；行数只统计 TS/TSX/JS/JSX/MJS/CSS/HTML）：

| 范围 | 文件总数（前→后） | 代码文件（前→后） | 代码行（前→后） |
|---|---:|---:|---:|
| frontend/web/src | 852 → 255 | 820 → 240 | 83,137 → 18,304 |
| frontend/packages（含构建脚本/测试） | 352 → 292 | 336 → 277 | 42,164 → 36,642 |

删除的旧页面测试随实现移除；共享功能测试继续保留，失效的旧页架构规则删除或改为新入口规则。代码来源的逐文件基线比对见 `docs/readflow/代码来源清单.md`，不能把整个阅读器或凭据模块称为新增原创。

本轮不打包、不安装、不运行成品；未启停预览；交付时只读检查 /proc/exe 未发现预览可执行文件进程。历史规划/验收记录仍可能提到已删页面，那是历史记录，不是可用入口；后端目录仅有前端验收静态页默认值和 launcher 测试夹具两处 URL 同步；未删除任何后端文件。

最终验证：Web tsc/build 通过；不使用 force-exit 的完整 Node 测试 **900/900**，0 跳过；桌面 lint 与 **98/98**；Reader typecheck/build 通过；后端核心 12 模块加 notes **208/208**；独立启动器、隔离预览复制与 native library service **19/19**。额外 domain 公共入口测试 **3/3**、类型检查及 API 25 个公开出口校验通过。

离线界面回归：工作台 17、Reader 9、设置 17、笔记 15，共 **58/58**；没有页面错误及未处理请求。截图分别在 `/tmp/readflow-t1/screenshots`、`/tmp/readflow-t3/screenshots`、`/tmp/readflow-t4/screenshots`、`/tmp/readflow-t5/screenshots`。构建/测试/可达性证据在 `/tmp/readflow-t11/`。


## 翻译模块（T12）

根因是文献导入只登记源 PDF，没有创建全文翻译任务；新 ReadFlow profile 也不会继承 RetainPDF 的模型凭据。本轮增加详情、书桌选择器、多选、命令面板和阅读器标签工具栏的真实提交入口，缺配置时就地引导。

- 新接口：`POST /api/research/workbench/items/{id}/translate`，`GET` 同路径查询状态，`POST .../translate/cancel` 取消。
- 后端 `workbench_translate.py` 负责附件归属、原生任务去重、文字层预检、OCR 模块预检和命令；`workbench_translation_errors.py` 归类并脱敏错误。NativeBridge 仅调用原生 HTTP，不改 Rust/翻译/OCR 流水线。
- 提交复用旧 `buildOcrPayload`、`buildTranslationPayload`、`buildRenderPayload`、默认配置 resolver 和现有 headless 凭据读取。配置由前端从同一存储读取后发送，文献库不另存 Key。
- `register()` 后调用原生文献 translate 接口；Rust 为 source 绑定实际 upload_id，进入原 JobsFacade。黄金样本调用真实旧 `submitJobRequest()`，模拟该 source 绑定后逐字段比对；不以手写期望 JSON 替代旧函数。
- 同一附件的排队/进行中翻译任务复用；请求锁和短暂提交回执覆盖并发及查询可见性窗口。缺 Key/URL/模型不提交；扫描前先看原始文字层，模块缺失引导设置，不触发下载。
- 进行中 2 秒轮询，空闲回到 20 秒调度；列表、详情、书桌及阅读器共用阶段/百分比。渲染中或失败时，即使已有部分产物，也不提前报告完成。
- 完成提示含对照阅读操作；已打开标签自动刷新任务 URL，并保留阅读页码。利用已有 Reader 三模式，不重写阅读器。系统通知是可选项，本轮只使用工作台提示条。
- 支持原生 `/api/v1/jobs/{id}/cancel`；未提供“删除译文”，因为现有文献/书籍删除接口会连带删除源数据或任务，不能代替只删译文。
- 启动器测试直接捕获假的 Popen 环境，锁住 `RETAIN_PDF_RESEARCH_CODE_ROOT`，不依赖继承环境变量，不启动实际预览。

错误映射：401/403 → Key/权限；429/quota → 额度或频率限制；网络/超时 → 服务连接；model not found → 模型；OCR → 本地识别；其余 → 通用失败。详情剔除已知凭据、敏感字段与长令牌；失败可重试并按类别进入设置。取消失败的“重试”仍执行取消，不会误提交新翻译。

验证：Web tsc/build 通过，全量 **908/908**；桌面 lint 与 **98/98**；Reader typecheck/build 通过。后端核心、工作台、笔记、Connector、新翻译及启动器/假服务测试共 **237/237**。离线界面共 **77/77**：新翻译 5、书桌 14、设置 17、文献库 17、Reader 9、笔记 15。日志在 `/tmp/readflow-t12/`，新翻译截图在其 `screenshots/` 子目录。

真实 Rust→假服务→译文 PDF 链路由验收方执行，配置、接口格式与步骤见 [翻译链路验收](translation-acceptance.md)。提供标准库脚本 `ops/development/readflow_fake_openai.py`，只监听回环地址，不记录请求内容或凭据；本轮仅测纯函数，未启动假模型服务，也未调用真实模型。

本轮未改 Rust API 或翻译/OCR 流水线行为，未打包、安装或运行成品，未启停现有预览；验收时需由启动器同步当前构建并重启 sidecar 以加载新路由。


## 重复导入与发布（T12.1 / 0.9.3）

`/api/research/files` 显式启用 Store 的事务内 SHA-256 复用：优先未删除条目，否则恢复回收站匹配条目。保留原标题、笔记、分组、阅读状态；已有重复记录不合并。Connector 与 CSL 不启用这个新选项，原去重语义不变。菜单、拖放与批量共用导入器，重复时提示并回到全部文献选中已有项；分组写入失败重试不重复上传或累计计数。

新增后端 5 项和前端 2 项测试。Web tsc、完整构建及全量 **910/910**；桌面 **98/98**；后端核心及工作台、笔记、Connector、翻译、重复导入和相关启动器/假服务 **242/242**，全部通过。

按完整打包命令（无 skip-web-build）生成 `readflow_0.9.3_amd64.deb`，226111840 字节，SHA-256 `043d22af6c179f09c7c751c88a4e07b5b2754ab3f8aa441e69235f0212ea774a`。从 deb 检查 control、全部 7407 个文件系统成员权限/root 所有权、MIT copyright；ASAR 98 个工作台/dist 文件逐字节一致，reader HTML 仅有预期 vendor/配置脚本改写。deb 中 63 个 ELF 均与通过 linux-runtime --check 的运行时一致。证据在 `/tmp/readflow-t121/`。未安装或运行成品，未操作现有预览、/opt/ReadFlow 或 23119 监听。

## 新论文阅读核心（R1）

新增 `features/paper-reader/{domain,state,ui}`，仅由工作台经 `index.ts` 装配。原文直读文献库附件 PDF，译文直读已完成任务的 PDF；鉴权仍走平台请求头。不再使用 iframe、上游阅读器包或 postMessage。旧 `reader.html` 与包保留独立运行；构建边界测试断言 workbench 的传递依赖不包含 `frontend/packages/reader`。

实现：可见页 ±1 虚拟化、双任务绘制队列、HiDPI 像素预算、文本/搜索层、内部链接、外链确认后系统打开、指针锚定缩放；引用 300ms 悬停与本地题名查找、图表/公式启发式截图、目录/缩略图/书签/搜索、双栏导航历史、信息与参考列表、阅读时长与进度、三种纸色、专注和复制引用。右栏按示意使用 352px（随全局 rem 缩放），左栏 208px。阅读时隐藏工作台主导航，保留标签条；专注再隐藏标签条和阅读 chrome。

`PaperReaderProps` 提供工具栏、选中工具条、右侧面板插槽。R1 只实现信息，批注/画布/AI 显示“即将推出”；书桌 AI 入口也明确禁用，避免暗示已具备旧阅读器能力。

书签及阅读时长存入新的 reader_bookmarks / reader_time / reader_ticks；GET reader、POST bookmarks、DELETE bookmarks/{id}、POST time 均按文献作用域。书签区分原/译模式，支持译文附页；计时增量限 60 秒并用请求 ID 幂等。进度复用 opened API，关闭标签前刷新最后待写页码。

已知边界：扫描件缺文字层时无法靠 pdf.js 识别引用/搜索；多栏、跨页参考条目和不规范题注可能漏识别或误裁。图题取上方、表题取下方、公式取附近区域；不做语义识别。夜间暂对整页 canvas 反色，未实现图片遮罩，但图表浮层保持原色。对照按同页号、页内比例同步，另一侧缺页则停其末页；可以独立滚动。阅读时间为可见且近期有操作的近似统计，非注意力测量。

旧阅读器暂缺项：页面批注/绘制/区域工具、Markdown、AI 问答与 Agent、实时译文叠加和下载工具。原笔记与批注数据没有删除，笔记空间、详情与按页打开继续可用。

夹具在 `frontend/web/tests/fixtures/`：12 页原文、14 页模拟译文、无书签目录版、100 页性能版，生成脚本 `make-paper.py`。离线脚本和 domain/边界测试在 `tests/paper-reader/`。新实现来源与第三方依赖见 `docs/readflow/代码来源清单.md` 的 R1 增补。

### 预览环境限制及恢复

最终验证：Web tsc 与完整 build 通过；Web 全量 918/918、桌面 99/99、library_mvp 后端全量 252/252、开发启动器及假服务 17/17，均无失败。离线浏览器场景 19/19（核心 11、补充导航 3、工作台集成 5）。入口可达性审计无孤立源码，diff 空白检查通过。

100 页合成 PDF 独立测量（1440×950、DPR 2）：组件挂载至首张 canvas 完成 195ms，从导航开始 298ms；连续滚动采样 180 帧，中位 19.4ms、P95 27.1ms、超过 50ms 为 0 帧。最多 4 张 canvas、约 58.79MiB 像素内存，绘制并发和等待队列各最多 2。此为本机合成夹具测量，不代表所有扫描论文的性能。原始结果及截图位于 `/tmp/readflow-r1/`。

本轮执行环境有独立 PID 命名空间：宿主原预览 PID 217463 的 40061 服务仍响应，但启动器在当前环境无法看到该 PID。一次启动尝试被 Chromium 单实例拒绝，误覆盖了 process.json。没有删除 SingletonLock、没有强停任何宿主进程；已新增 `recover`：仅在内核可核验可执行文件、profile/chromium 参数和本启动器 stdout 日志时才重建记录。启动失败也已补回滚旧记录的测试。

需在宿主仓库终端执行（不启用 Connector）：

```sh
python3 ops/development/native_retain_preview.py recover
python3 ops/development/native_retain_preview.py restart --no-sandbox --debug-port 9229
```

恢复命令不启停进程，不读取凭据；重启保留同一 profile/chromium。没有从沙箱绕过进程隔离发信号；当前原预览仍运行，新的后端书签路由须宿主重启后才加载。源码及离线验证不依赖这个运行实例。本轮不打包、不安装、不运行成品，不操作 /opt/ReadFlow 或 23119 监听。

## 批注工作台（R2）

R1 排版先展开，再按职责拆分：阅读器组合/导航状态/模态对话框/引用查找/复制分别独立。`paper-reader` 从 19 个 TS/TSX 文件、766 行变为 40 个文件（包含 R2 新功能）；超过 160 字符的行从 106 降至 2，超过 140 字符从 132 降至 6，剩余均为 Tailwind 字符串。新增行宽架构测试拒绝超过 140 字符的非字符串代码；单文件最大 370 行，无压行规避。

ReadFlow 自有批注实现位于 `domain/annotations`、`state/annotations`、`ui/annotations`，未使用上游 reader 的批注实现。五色高亮/下划线、Markdown 说明、可拖动便签、PNG 框选、三档自由画笔/整笔擦除；选择浮层、批注编辑浮层、右栏筛选/排序/分页展开/多选、Markdown 导出和整理成自由笔记均已接通。只给原文 pane 注入 SVG 批注层；对照译文只有文本选择与复制。页面以归一化坐标绘制，夜间颜色由主题令牌调整。

- `GET/POST /api/research/workbench/items/{item_id}/annotations`：列表/创建；客户端 ID 防网络重试重复创建。
- `PATCH/DELETE .../annotations/{id}`：编辑/删除；按文献验证作用域，删除可幂等重试。
- `POST .../annotations/export`：按指定 ID、颜色语义导出，`as_note=true` 生成 notes 自由笔记。
- `GET /api/research/annotations/{id}/image`：鉴权 PNG，存放在文献库 `annotation-images/`，随批注删除。

`annotations` 存储附件、零基页码、类型、颜色、归一化 rects/ink、quote/note、宽度、image_ref、时间和 source_id；`annotation_imports` 保存迁移台账。旧 notes 原行不删，幂等导入后由新表承担工作台的批注读取和计数；台账阻止删除后再次导入。旧 notes 写入口保留存储层校验，兼容写入后同步新表。自由笔记仍来自 notes；effective_notes 统一 T5、详情、文献行和书桌口径，避免双算。

迁移只在本轮合成库验证，未读取或修改用户库、未启停预览；正式预览由验收方重启时执行迁移。旧 reader-viewport 坐标无可靠页面尺寸，保留内容/页码而不猜坐标；批注栏明确标示旧批注并可跳页。区域导出使用本机图片引用，删除批注后引用失效；说明显式保存，简单 Markdown 不执行 HTML。整理成笔记沿用 100k 字符上限。撤销最多 50 组本会话操作，不跨重启。

验证：tsc、完整 build、Web 全量 925/925、桌面 99/99、后端 library_mvp 全量 259/259；后端包含新增 7 个批注测试。离线 R2 10 个场景（交互 9、设置持久化 1），R1 核心/导航/工作台集成 19 个场景通过。截图与日志在 `/tmp/readflow-r2/`。

100 页 / 500 条批注，1440×950、DPR 2、右侧批注栏展开：首 canvas 225ms；连续跨页滚动采样 180 帧，中位 25.7ms、P95 39.6ms、超过 50ms 为 0。页面同时最多 20 条批注、4 张 canvas；这是合成夹具压力测量，不是所有 PDF 的性能保证。本轮不打包。

## 思考画布与批注收尾（R3）

R2 收尾：编辑中的批注与复选框选择分别存储，新建/点击只打开单条编辑，勾选至少两条才显示批量栏。编辑浮层按原文批注与页面/滚动容器边界定位，上方优先、下方回退；滚动或换工具关闭，页面尺寸变化重新测量。单条操作放入卡片 ⋯。筛选改为横向胶囊，排序用小菜单。

新增 `features/thought-canvas/{domain,state,ui}`，DOM 卡片 + SVG 曲线，只有可见节点与穿过视口的必要连线参与绘制。支持摘录、Markdown 便签、待解决卡、图片、文献卡、文字标签、空间分组框、带标签的箭头/无箭头连线；多选、框选、移动/尺寸、吸附/对齐、平移/指针缩放、搜索、会话撤销与 Markdown 提纲。未引入依赖，Markdown 使用仓库既有 marked；未复用上游阅读器代码。

工作台通过 feature index 装配侧栏列表、共用标签条与阅读器停靠，阅读器只接收选区注册/引用列表/跳转回调。文献 + 画布分屏可拖动分隔条，也支持只看文献/只看画布。原文选区拖入会创建高亮与卡；批注卡可经画布标签悬停切换后拖入，或使用选择器；文献库条目经画布标签拖入。来源回跳与原文角标双向定位，显式跳转才闪烁，不影响之后普通标签切换的续读位置。

后端独立 `canvases`、`canvas_nodes`、`canvas_edges`，另有 `canvas_assets` 记录图片归属。节点 JSON 保留类型、几何、文字、来源快照等，annotation_id/item_id 单独约束/索引。接口：

- `GET/POST /api/research/workbench/canvases`；`GET/PATCH/DELETE /.../canvases/{id}`。
- PATCH 的 `nodes/edges/delete_nodes/delete_edges` 为增量；`name/group_id` 为元数据。
- `GET /.../canvases/references?item_id=...` 或 `annotation_id=...` 用于反查。
- `GET /.../canvases/{id}/export` 提纲；`GET /.../{id}/nodes/{node_id}/image` 鉴权截图。
- 批注 DELETE 增加 `canvas_policy=keep|remove`；有引用但未给策略时返回 409。阅读器及笔记空间均提供两种选择。

拖动/编辑结束后 300ms 防抖，实例内串行保存，冲突策略为节点/连线级后写为准。分组关联删除只置空，不删除画布。引用未断开时读当前批注引文、页码与颜色；静态化时冻结最新值并清空关联。图片卡保存独立副本，删除原批注不丢图；节点删除保留资产支持撤销，删除画布清理全部资产。引用键复用 workbench 的生成与消歧逻辑，出处同样沿用既有解析。

已知边界：空间分组不是嵌套目录，重叠框按上/左顺序归入首个框；连线不自动绕避第三张卡。撤销最多本会话 50 组，外部引用删除会清空受影响画布历史，静态卡不会因恢复原批注而自动重新关联。重启不恢复视角。Markdown 导出为文本提纲，不内嵌截图；可选 PNG 导出本轮未做。

验证：tsc、完整 build、行宽及架构门禁通过。Web 全量 **933/933**、桌面 **99/99**、后端 library_mvp 全量 **268/268**，均无失败/跳过。默认 test-force-exit 偶发少注册 14 个旧阅读器用例，因此最终 Web 使用同一注册器的 `--test --test-timeout=60000 --test-concurrency=4` 全量命令（npm 缓存放 `/tmp/readflow-r3/npm-cache`，offline=true）。新增画布后端 9 项；离线新场景 17 项（主流程含 R2 收尾 7、联动 6、手势 4），另有 R2 9 项与 R1 集成 5 项回归。

性能：离线 Chrome、1440×950、DPR 2，合成 300 节点/200 连线，连续平移缩放 180 帧 RAF 采样，中位 **16.7ms**、P95 **16.8ms**、超过 50ms **0**；最多同时渲染 **63 节点/63 连线**。这是合成场景测量，不是所有复杂卡片的性能保证。证据及截图在 `/tmp/readflow-r3/`。

未启停预览、未读取用户库或凭据、未调用模型、未安装/运行成品、未打包；由验收方重启预览加载新 schema。

## 选段翻译与 AI 伴读（R4）

### 启动缺陷与恢复核查

图片目录由 R2/R3 模块初始化创建，启动入口却另维护顶层白名单。旧测试只验证新临时库，或直接重开 Store，没有将完整模块落盘后的目录再交给 `prepare_data_root`，所以漏掉二次启动失败。

目录名集中到 `backend/library_mvp/data_layout.py`，启动器和 blobs、OCR、agent 配置、批注/画布图片模块共用。Store 与启动器都对登记项拒绝符号链接。新增源码 AST 守卫，扫描生产模块中的 `data_root / 名称`，未知字面名称或集中常量未登记即失败。

回归在合成目录中真实初始化数据库，写入框选 PNG、画布副本、OCR 子目录及假 agent 配置，再连续两次运行 prepare、完整应用构造、ASGI 生命周期与鉴权健康检查；另测两个图片目录和 blobs 的符号链接。

机器中断后没有沿用已丢失的 `/tmp` 日志。重新检查本轮文件、冲突标记、`git diff --check`、Python AST、tsc，并完整重建 dist；核对源码修改时间不晚于新的构建/验证结果。未读取真实文献库或凭据。

### 实现与接口选择

选段翻译使用 `/api/research/workbench/items/{id}/assistance/translate`。前端仍经 credentials headless domain 与 T12 `translationPayload` 读取同一配置；启用词表经原 Rust glossary 接口读取。`/translate/bundle` 是 PDF 异步任务，实时译文又依赖任务产物，均不适合任意选段，因此使用受外部模型开关控制的小文本接口，复用现有 AI transport 的 OpenAI 兼容请求。

AI 配置仍来自 T4 的 `/api/v1/ai/runtime-config`，通过 NativeBridge 读取，不新增凭据文件或备用配置。问答复用 `ai_runtime.build_deepseek_chat_fn` 的流式传输与 RequestControl，限定为空工具的只读文本对话；不走 `/v1/ask` 的结构化文档/工具执行分支，以确保只发送用户确认的上下文。新 `/assistance/ask` 输出 SSE，`GET/DELETE /assistance/conversation` 读写本机 SQLite 会话；`/workbench/assistance/status` 只返回公开服务、模型和目标指纹。

服务只在翻译按钮/T 或确认发送后调用模型。模型地址禁止凭据、查询和重定向，连接超时 5 秒、读超时 45 秒、请求控制 60 秒；取消会关闭传输，未完成答案不写库。复用 T12 错误分类，正文和 Key 不进入日志或错误详情；分片跨边界的 Key 同样遮蔽。读取状态/历史不调用模型。

每篇文献当前会话首次发送需确认；“本文献不再提示”为未预选复选框，勾选本身不发送，点击发送才生效。许可按文献及服务 URL/模型指纹保存，目标改变再次确认。会话清空同时清除许可，代数校验阻止旧请求恢复已清空历史。上下文限题名、摘要、本页文字、选段及最近历史；没有全文检索或 Agent 操作。AI 服务离线仍显示本机历史。

T5 安全 Markdown 解析器移到 platform，共用原 HTML 转义/链接白名单。规范页码可跳回原文；回答可保存到笔记空间或作为便签加入画布。书桌 AI 入口恢复可用；原文选段工具新增翻译、问 AI，T 进入集中快捷键定义。

R3 收尾：停靠画布以标题选择器、工具、全屏按钮合成一行，窄栏可横向滚动；连线标签用明暗独立底色胶囊。浏览器实测对比度浅色 12.63:1、深色 10.75:1。

### 验证及验收

低负载执行：前端 `--test-concurrency=2`，后端串行，同一时间一个 Chrome，禁用测试 Chrome GPU，场景结束关闭；未启动 Electron、未启停预览、未打包。

Web 全量 937 项通过，桌面 lint 与 99 项通过；后端普通套件 277 项中 276 通过、1 项慢测留到最后单独运行。启动器/假服务 21 项通过（包含新增重启回归），reader_assistance 定向 9 项通过；离线主流程 7 项及画布收尾 2 项通过。最终慢测结果另记于本节下方。

验收命令及字段见 `docs/readflow/选段翻译与AI伴读.md`。假模型服务默认 48991，可选的 41160 仅提供离线预览的 runtime-config 桩；实际模型路径为 `/v1/chat/completions`，均只绑定 127.0.0.1，不外发、不记录请求内容。需要由验收者以 `--allow-external-models` 重启预览。

边界：FX Gateway 模式暂不支持这条只读对话路径；不执行 Agent 操作。页码只做范围检查，未验证论据。选段 8k、问题 4k、本页 20k、摘要 6k 字符，历史最多 12 条/20k 字符。选段操作针对原文，译文附页无对应原文时需切回原文。缓存限本阅读器会话，同一术语表内容更新后可重开阅读器刷新。

最终独立慢测：所有其他测试及 Chrome 关闭后，仅运行一次 `READFLOW_BENCHMARK=1 ... -m unittest backend.library_mvp.tests.test_workbench_performance`，1/1 通过。2000 文献接口 cold 150.88ms、mean 142.08ms、P95 156.54ms；后端 277 个用例因此全部覆盖通过。验证日志与截图在 `/tmp/readflow-r4/`，前端 937/937、桌面 99/99、启动器/假服务 21/21、离线 9/9 均通过。未执行其他并行性能测量。


## 闪卡复习与旧阅读器清理（R5，0.9.4）

- 新增 `features/flashcards/{domain,state,ui}`：SM-2 变体纯函数、API 端口、三种卡型编辑器、复习与管理。工作台通过功能出口注入导航和现有偏好；paper-reader/thought-canvas 通过同一制卡上下文关联原文。
- `decks` / `flashcards` / `card_reviews` 是本地唯一事实来源；卡片含来源快照、批注关联、间隔、易记因子、到期学习日、暂停与版本。新增 `/workbench/decks`、`/workbench/flashcards` CRUD、`/flashcards/{id}/review` 和 `/card-reviews`。无新增数据目录。
- 学习日以用户本地凌晨 4 点划分，默认新卡 20、复习 200。重来放回本轮，其他评分按日调度；评分版本冲突返回 409，避免双窗口重复评分。卡组与卡片断点保存于偏好所在浏览器，实际复习日志存后端。
- 从选段制卡自动创建高亮或复用相同选段；批注与画布摘录入口复用同一面板。“卡”角标可打开编辑，复习来源可回原文并定位。删除来源时，`canvas_policy=keep/remove` 同时决定画布引用和闪卡保留静态快照或级联删除；笔记空间删除批注也有同样确认。
- 选段译文优先带入；只有译文 PDF 时采用同页文本供用户编辑。跨页选段保留全文引文，回源定位第一条高亮。AI 出题是可选功能，本版未提供，不会自动发模型请求。
- R4 收尾：只有发送成功且输入仍是已发送草稿时才清空，失败或用户已改写则保留。假服务验收顺序改为先分配预览实际 AI 端口，再启动假运行时，并加文档顺序回归。
- 删除 `web/reader.html`、`app/reader`、`features/reader`、`packages/reader`，以及独占 jobs 状态、API/domain 导出、样式、测试、产物和依赖；构建、CI、桌面白名单、预览复制与打包清单只保留 workbench。后端翻译接口与 MIT 声明保留。
- 前端源码统计口径 `web/src + packages/*/src`：554 → 363 文件，57,402 → 31,815 行；包内历史皮肤、独占测试和生成产物另删除。可达性审计 363 文件、不可达 0。来源比例见 `docs/readflow/代码来源清单.md`。
- 验证：Web 314/314、桌面 99/99、后端 281 项普通测试通过，慢基准 1 项最后独立通过；启动器/假服务 22/22。tsc、完整 build、行宽和可达性通过。
- 离线场景：三种卡型、挖空、编辑、高亮与角标、翻面评分、重新加载后按卡组续复习、回源、书桌、浅深色；两种来源删除选择；AI 成功清空与失败保留。仅一个禁用 GPU 的 Chrome，所有请求拦截为假数据。
- 慢基准：2000 文献/附件/笔记、20 分组，冷请求 190.75 ms、均值 143.53 ms、P95 194.45 ms；仅最后单独运行一次。随后发现并修复卡组断点，补跑前端验证与打包，未重复或并行做性能测量。
- 日志、截图及审计清单：`/tmp/readflow-r5/`。安装包信息见 0.9.4 版本说明；不启停预览、不安装或启动成品。


## 仓库整理与收尾（M1，0.9.5）

- 删除 9 个上游工作流，仅新增 `readflow-ci.yml`。具体逐项理由、发布标签约定和二次启动命令见 `docs/ops/readflow-release.md`。根 workspaces 和 lockfile 保持一致；CI 使用 Node 22 与已实测版本的 Python 3.11 依赖，不打包、不跑 Rust、不用 secrets。后端黄金请求体测试依赖 Node/esbuild，backend job 也安装根 npm 依赖并构建共享包。
- PDF 图片原色：从 pdf.js operator list 解析图像操作，累积 save/restore、Form 与仿射变换，得到页面四边形；只分配图像外接区域位图，原色覆盖在夜间 PDF 上。随离屏页清空像素；原图和恢复层同时显示，避免短暂负片。矢量图不识别，复杂透明/裁剪区域是已知局限。
- 将 ReadFlow 自有 R4 会话端口抽到 `features/reader-assistance`，避免 paper-reader 与 flashcards 相互依赖。AI 出题仍通过 `/workbench/items/{id}/assistance/ask`，沿用服务指纹、隐私确认、外部模型开关、流式传输与错误脱敏；只将有效 front/back JSON 建议填入表单，不自动保存。已补取消信号和跨服务确认重置。
- PNG 使用 Canvas 2D 与现有连线路由绘制整个逻辑图，不依赖视口裁剪和新依赖；包含图片、卡片、元数据、分组、连线与标签。读取现有主题令牌，限制为最长边 8192 / 1600 万像素。
- 空笔记卡不显示“查看全部 0 条”。PDF 新建条目保守读取 Author/Subject/Keywords，不覆盖已有条目；工具名过滤、逗号倒装姓名与多作者均有测试。
- `/api/research/connector/status` 只返回 ReadFlow 公共字段，版本由 `app.getVersion()` 经子进程环境提供，独立服务无版本注入时显示“开发版”。握手 GET/POST ping、协议头与 prefs 没有改动，Connector 全量测试通过。
- 验证数字、性能与 deb SHA 见 0.9.5 版本说明。日志/截图在 `/tmp/readflow-m1/`。完整 Electron headless 窗口未就绪，已中止隔离检查；包内 Python 服务富数据重启 2/2 通过，桌面两次启动需宿主补验。检查脚本添加 90 秒看门狗、有限退出等待和专属 profile/PID 出生时间校验，不操作其他应用。
- 验收（Claude，2026-10-04）：预览中逐项核对六项修复，均通过，未拦截到任何外部请求，AI 出题的请求只在点「发送」后出现。PNG 导出发现英文在单词中间断行、来源文字被压扁、缺少批注色条、留白过大，已修复：新增 `thought-canvas/domain/text-wrap.ts` 和 5 项测试，Web 共 322 项通过。重新打包后，在本机正常桌面环境下完成完整 Electron 二次启动，两次都就绪。

## 块级翻译（X1，0.9.6）

- `backend/library_mvp/paper_blocks_{model,extract,graphics,storage,translate,render,service,routes}.py` 为独立实现，不调用或复制上游翻译流水线。`paper-blocks/<sha256>/` 保存版本化块清单、矢量 PDF、PNG 缩略图、译文缓存与生成结果，已集中登记到 `data_layout.py`，沿用所有权与防符号链接检查。
- schema v1：块 id 由页码、bbox 和文本生成；`anchors` 保留跨栏／跨页段落的全部位置，包含未旋转页面 bbox、原生 PDF bbox、旋转后归一化 view_bbox。页面记录 CropBox、MediaBox、旋转、两套矩阵、文字状态；块记录类型、保护片段、caption_id、asset、extractor 和 confidence。后续版面模型可替换提取器，OCR 可补无文字页的文本，仍输出此 schema。
- CPU 工作线程提取，PyMuPDF 操作串行；每篇最多一个全文任务，可与单块任务并存；单全文最多两批并行，全服务最多两个模型请求，按 12 块／约 9000 字一批。默认跳过图表本体、公式、页眉页脚、作者与参考文献。占位符要求精确出现一次，批量格式错误只重试对应块，仍失败则保留原文。
- 沿用 R4 的 `translation_config`、外部模型开关、术语表查询、`run_chat` 超时／脱敏和取消控制。配置仅在任务内存中；取消立即清空配置并中止传输，结束清理引用；不存 Key 或 Key 的哈希。缓存键为块 id、目标语言、URL／模型／术语表指纹，按请求传入设置。模型回显即使使用 JSON Unicode 转义，也会在解码后再次脱敏。
- 新接口以 `/api/research/workbench/items/{id}/blocks` 为根：GET 状态与清单，POST `/extract`、`/translate`、`/jobs/{job}/cancel`，GET `/files/{name}` 与 `/latex`。提取和翻译返回异步任务；同附件并行任务复用，活动状态 800ms 轮询，闲置 5s。
- Typst 模板固定，通过 `json()` 读数据，不插值执行文本。已实测内置 0.15.1 支持 `image("crop.pdf")`，优先嵌矢量 PDF，个别素材失败再试 SVG，仍失败则回退原文。图注与图表保持同页；参考文献保留原文，附录图表不因参考文献范围标记而被删除。LaTeX ZIP 使用逐字符转义的 xeCJK 模板和裁剪 PDF，本机无 XeLaTeX，未编译。
- 桌面从既有资源路径传入 `READFLOW_TYPST_BIN`、`READFLOW_TYPST_PACKAGES`、`READFLOW_FONT_DIRS`；预览走相同主进程解析。源码运行可显式指定这些变量，或查找仓库现有 unpacked 资源；CI 没有内置 Typst 时，仅实排版用例跳过。
- 前端 `features/paper-blocks/{domain,state,ui}` 通过出口供 ReaderHost 使用；paper-reader 只提供原文 overlay 插槽，不依赖块 API。阅读器全文按钮走新流程；新结果优先，缺少新结果时保留旧 PDF。其余文献库／书桌兼容任务入口和统计暂不迁移，以限制本阶段范围。
- 块模式在存在当前语言译文时自动开启，手动关闭作为全局安全偏好记住。开启只提取本地结构，单击译文卡里的按钮才调用模型；原有拖选、批注工具和引用／图表点击先处理。图表卡解析对应图注，译文可复制或交给现有笔记、画布、闪卡入口。目标语言在工作台偏好中保存；「导出译文」可下载 PDF 或 LaTeX 工程。
- 合成素材位于 `frontend/web/tests/fixtures/blocks/`，`generate.py` 使用 Typst 生成双栏 PDF，并生成坐标交叉验证与离线译文样例。`paper-blocks.test.mjs` 用实际 pdf.js 视口检查 CropBox／MediaBox 偏移与四个旋转角度。
- 离线 UI：`cd frontend/web && node --import ./tests/helpers/register-jsx.mjs tests/paper-blocks/smoke.mjs`。已有阅读器与选段工具的回归使用同目录 `paper-reader/*-smoke.mjs`，浏览器串行且禁用 GPU。测试不调用模型。
- 性能仅在其他测试及浏览器结束后单独执行：`PYTHONPATH=. <内置 python> -m backend.library_mvp.tests.benchmark_paper_blocks --output /tmp/readflow-x1/benchmark.json`。真实输入仅使用仓库已有普通 PDF，拒绝符号链接；不参考其对应项目源码。
- 假服务验收：由维护者以 `--allow-external-models` 启动预览后，运行 `python3 ops/development/readflow_fake_openai.py --port 48991`。翻译设置用自定义服务、`http://127.0.0.1:48991/v1`、模型 `readflow-test` 与任意非空测试占位凭据。此流程不依赖 AI 运行时端口。请求是 `/v1/chat/completions`，消息内为 `{"blocks":[{"id","text","type"}]}`，响应 `choices[0].message.content` 为同 id 的 `{"blocks":[{"id","text"}]}` JSON；假服务逐块加「【译】」。
- 完整验证、样例统计、性能、包校验及二次启动结果见 `docs/readflow/版本说明-0.9.6.md`；日志和截图保存在 `/tmp/readflow-x1/`。本轮不启停预览，不安装 deb，不运行完整 Electron。


### X1b 验收返修（仍为 0.9.6）

- 新增 `paper_blocks_lines/text/inline.py`，按物理行保留 bbox、字体、字号、字重、基线和段落信号。提取器升为 heuristic-2；schema v1 兼容扩展 protected.runs、source_lines、figure_text 及 anchor 段落标记，旧缓存字符串与新结构化缓存均可读。
- 三篇真实样例各有独立结构回归：标题单块、续行字体／行距、架构图／表格的完整几何覆盖、图内文本不进正文、重复边缘文本不进 heading、跨边界没有缩进或段前间距。匹配不依赖具体文章文案。前后统计见 0.9.6 版本说明。
- 任务区分 extract/block/full，全文仅按 sha256 去重；单块按块 id、语言、配置指纹去重，可与全文共存。每个全文最多两批并行，全服务 semaphore 限制两条请求；取消遍历该任务的全部 RequestControl，立即清理配置引用。
- 每批返回缓存增量，merge_cache 在锁内重新读取、合并、原子写回。进度在批完成和保存后累计；上下标、本地空白均由占位符映射还原，模型只能返回 id/text，不能提供可执行排版结构。目标语言在提示中使用完整名称。
- GET blocks 增补 jobs、scope、block_id、language、has_translation、needs_extract；按查询语言读取对应服务指纹缓存。UI 分别追踪全文与当前单块，避免互相禁用按钮；已有当前语言译文自动开启，关闭状态与一次性提示沿用工作台安全 prefs。旧清单只触发本地重提取，不会自动调用模型。
- Typst 使用固定 rich() 函数从 JSON 的 text/super/sub 生成内容；React InlineRuns 用原生元素，源文偏移按 Unicode 码点处理，无 innerHTML。导出／复制仍使用纯文本字段。
- Web 329、桌面 99、后端 317（含独立慢测）、启动器／假服务 24 项通过。离线新增 6 组、原块模式 9 组通过，单 Chrome、禁用 GPU，模型用内存桩。样例 PDF 已重写至原验收目录；完整重打与包内二次启动结果见版本说明。

语言缓存上下文只在成功批提交或命中成功缓存后切换；失败的新服务请求不会遮蔽已有译文。不同缓存键合并，同键以最后成功提交的结果为准。

X1b 最终包：224,542,336 字节，SHA-256 `e98831473b752c3373bfacc121bbe9cf1d8707f02c45e591e68d184b654abf3d`；完整构建、内容校验、63 ELF 与包内服务二次启动 2/2 通过。

## 内置版面与 OCR、图片翻译（X2，0.9.7）

- S1 完成：固定组件清单、SHA-256 下载／打包双重校验、CPU 两线程推理与 CI 模型缓存已接入。ORT 1.25.1、NumPy 2.3.5、PP-DocLayout-S、PP-OCRv5 mobile；无 OpenCV、无封装代码复用。Web 329、桌面 99、后端 328（下载期间模型项暂跳过后另跑 3/3 通过）、CI 约束 3/3 通过。源模式运行 `python3 ops/models/fetch.py --stage .model-cache/runtime`，生产包离线取缓存；模型缺失不下载、回退启发式。来源及许可证差异详见 LICENSE.third-party.md。
- S2 完成：PP-DocLayout-S 原生 CPU 推理、按页缓存与置信度融合已接入；缺组件时回退启发式。模型区域与矢量证据取并集，保留正文段落的字体／间距边界。后端 331 项通过（1 项慢基准默认跳过），含三篇真实论文的全部 X1 连续性和结构断言。定量比较与单独性能测量在发布验收阶段归档。
- S3 完成：独立 NumPy run-length / union-find DB 后处理、CTC 解码、扫描页和位图标签识别已接入，坐标按实际裁剪像素原点回映。内置 OCR 成为设置页和 OCR 作业的首选，不触发下载；旧可选模块保留兼容。合成扫描 PDF 与生成脚本已加入夹具。Web 329、typecheck、后端 335 项通过（1 项慢测跳过）；包含扫描词召回、坐标、缓存及新旧模块共存回归。
- S4 完成：图内标签独立 id／缓存，数字、单位、公式及化学式过滤，图卡显示对照；新增默认开启的 PDF 图中文字开关。叠加在矢量裁剪副本上，字框无法容纳时保留原文；源裁剪不变，文本按字面写入。Web 329、typecheck、后端 338 项通过（1 项慢测跳过），覆盖筛选、稳定 id、原图哈希及注入字符。
- S5 完成：批量上下文包含论文题名和章节；按估算 token 数组批，JSON object 模式默认开启，明确不支持时退回；length 拆批，429／5xx 最多退避重试 3 次，保留两请求上限及取消。usage 随任务／结果累计，界面显示 tokens。假服务模型名支持 readflow-fenced、readflow-length、readflow-rate-limit、readflow-missing、readflow-tampered、readflow-no-json。后端 345、Web 330、typecheck 通过（慢基准 1 项跳过）；没有真实模型请求。
- S6 完成：0.9.7 完整 nice 打包；最终 Web 330、桌面 100、后端 347（含独立慢测）、启动器／假服务 24、CI 约束 3 项通过，离线 UI 共 20 组通过。模型按 CPU 两线程运行，86 ELF 最高 GLIBC 2.34；ASAR、62 个 Python 源文件及 7 项模型资产一致，已有 layout／OCR 缓存的包内服务重启 2/2 通过。安装增加 99.58MB，deb 增加 38.07MB，校验值见 0.9.7 版本说明。
- X2 最终目检收尾：OCR 文本由高置信版面类别补全，保留 OCR 与 layout 各自置信度；原生图中文字按字形间距拆分单元格，数字密集行与常见化学简写不翻译。图中文字由固定 Typst 模板从 JSON 叠加并统一字体子集化，源裁剪不变，避免每图重复嵌入完整字库。提取器 hybrid-5；已有纯启发式清单会在模型可用时本地重建。
- 最终测量（串行独占）：4 篇样例版面平均 21.33–31.91ms／页；三篇真实 PDF 提取含图片 OCR 为 3.852／4.649／2.266 秒；3 页扫描件 1.361 秒／页，776 个英文词召回 99.87%。这是固定区域／英文词的局部验证，不是通用准确率承诺。样例及 metrics.json：`/tmp/readflow-x2/final-evaluation/`；截图：`/tmp/readflow-x2/screenshots/`。

### X2b：SafeVLA 拆块返修

- 新增 paper_blocks_sections.py：按原 PDF 目录匹配页内标题，结合章节样式、附录编号、条目格式及版面 reference/text 投票约束参考文献范围。SafeVLA 原书签缺少 References，仍从第 18 页 A 节正确结束参考文献。
- 新增 paper_blocks_special.py：脚注分隔线和连续区域、图注跨栏锚点及图形附近细字归属；列表悬挂续行并入同一条目，跨页／栏保留精确锚点。图注同字体族的粗细变化不再截断；先前断言相应改为字体族＋字号／间距检查。
- Typst 书签沿用原目录层级；非目录的启发式粗体段落仅改变外观，不重置后续附录子章节。提取器 hybrid-6，不改前端源码，不改变原库数据。
- 本地 SHA 固定的 SafeVLA 测试只经 READFLOW_SAFE_VLA_PDF 指定路径，缺文件时跳过；同类合成 PDF 与纯函数测试在 CI 常规执行，不提交真实论文。当前统计 X2 580→500 块，reference 298→98；附录 text 0→91，假服务成功翻译 175 个块，另有 254 个图内标签。
- X2b 最终验证：tsc、完整 Web build、Web 330、桌面 100、后端 365（含本地 SafeVLA 6 项与独立慢测）、启动器／假服务 24、CI 约束 3 项通过。四类断裂、附录书签层级及图轴细字归属均有回归；本轮不改前端源码。
- X2b 最终包：262,631,988 字节，SHA-256 `838bd585003e1e798e59a1f49eb84847b40834f5e82b6a3318b0184efa4dc862`；control／权限／ASAR／64 个 Python 源文件／7 项模型资产／86 ELF／MIT 校验通过，包内三模型 CPU 推理与已有数据二次启动 2/2 通过。

### X2c：数学段落连续性

- 新增 paper_blocks_math.py：结合数学内容与独立、居中／编号、留白识别 display group；编号、上下标与极限统一裁剪。连续正文按基线合并，保护片段使用逐行精确偏移，合并后重定位。SafeVLA 全篇 text 174→131，违规单行碎片 36→0，单字符公式 1→0；原文 3–4 页与自有合成样例均有结构回归。
- result 分为 render_fallback、label_fallback，翻译失败另用 translation_fallback；新结果不写 fallback_blocks，前端对旧数据明确显示历史提示。usage.reasoning_tokens 读取明确的服务字段，累计但不重复加总，不默认发送关闭思考参数。提取器 hybrid-7。
- 验证：Web 331、桌面 100、后端 376（含独立慢测）、启动器／假服务 24、CI 约束 3 项；新增离线明暗状态场景通过。SafeVLA 假译文 3–5 页已目检，记录在 /tmp/readflow-x2c/。
- X2c 最终收尾：补测并修复双栏编号归属；后端最终 376 项（含独立慢测）通过，SafeVLA 原文 3–4 页与合成数学 PDF 均无违规单行续句或单字符公式。已目检假译文 3–5 页，并验证明暗界面中推理用量和三类保留原文提示。
- X2c 最终包：262,645,596 字节，SHA-256 `8a62374790ddc687129930177b4bc9e322e120b22db6e4611608b68ff51c4ee6`；完整 nice 构建、ASAR／65 个 Python 源文件／7 项模型资产／86 ELF／MIT／权限通过；包内三模型 CPU 推理、已有数据连续启动 2/2 通过。

## X3：翻译提速（0.9.8）

- `translation_speed.py` 集中管理翻译专用能力记忆和 FIFO 全局限流器：官方 DeepSeek 默认关闭思考；400／参数不支持时省略后重试，本次进程按服务地址及模型记住不支持。AI 伴读／出题仍使用原通道；速度偏好不进入块缓存与选段缓存指纹。
- 未保存并发时 DeepSeek 8、其他服务 4；已有设置保留并限制至 16。所有块任务与选段请求共享限流器；不同设置同时使用时取较小上限。429 同一波只减半一次，退避期间释放名额，连续成功后逐步恢复。使用可取消的异步 HTTP I/O，覆盖响应头等待、读流、排队与退避，任务协调仍在原后台线程中。
- `paper_blocks_batches.py` 按约 2,100 输入 token（含保护占位符、题名、章节和术语表）组织批次；有足够块时至少两轮并发，长块保留完整并沿用截断拆批和失败块重试。当前页、后两页优先，其余保持原顺序。阅读器新增即时页码通知，独立于一秒节流的持久化进度。
- 每批在锁内重新读缓存、合并、原子写回；进度只计已完成块。前端进行中最多每 800ms 轮询一次且不重叠，选中的卡片随批次更新；全部翻完后才显示「正在排版译文 PDF」。
- 假服务支持固定延迟及每千输出字符延迟、`readflow-no-thinking`、`readflow-rate-limit`；`benchmark_translation_speed.py` 对同一合成／SafeVLA 块集测旧串行、旧双并发和新八并发。实际 DeepSeek 测量留给维护者，不调用真实模型。
- 独立测速完成：固定 1.5s／请求 + 0.5s／千输出字符；47 单元合成样例总耗时 10.498／5.448／5.245s，665 单元 SafeVLA 为 145.362／73.798／17.796s（旧串行／旧双并发／新八并发）。SafeVLA 首批分别为 3.911／1.898／2.129s，新方案从第 4 页优先；结果均成功，缓存逐批提交，原始记录见 `/tmp/readflow-x3/benchmark.json`。短文收益有限，不将假服务调度收益等同真实模型提速。
- 中断恢复后核对关键调用链、Python 语法、tsc 和工作树空白检查，未发现半截改动；后端整套重跑完成。源码验证为 Web 334、桌面 100、后端 389（含单独慢基准 1）、启动器／假服务 24、CI 约束 3 项通过。读取 SafeVLA 仅用已授权的公开 PDF／块清单；未读取真实凭据、启停预览或调用真实模型。
- 最终包 0.9.8：262,653,116 字节，SHA-256 `55bbc5bd9a2e95b8ecffb6eb657f8bf2bbb512e9b3791918dd1e489840f64d67`。nice 完整构建、control／权限／ASAR／67 个后端源文件／7 项模型哈希／86 ELF（最高 GLIBC 2.34）／MIT 均通过，包内三模型 CPU 推理与已有数据二次启动 2/2 通过。四组离线脚本覆盖新增速度设置、批次更新、阅读器回归、AI 与运行时默认配置；未安装成品或启停预览。

## X4：多论文拆块鲁棒性（0.9.9）

- 新增 corpus 评估／指标／拼图／比较脚本，7 篇机器人与 ML 论文、SafeVLA、10 篇仓库样例统一评估，共 488 页。输入只读，输出 `/tmp/readflow-x4/`；串行运行，CPU 两线程，不联网或调用模型。
- 基线保留了 4 篇提取失败与其他 14 篇的指标、假译文。比较按相同的 14 篇可提取样本计算，恢复成功的 4 篇单列，避免混用分母。页眉排除基于原始行而非旋转大包围盒，OCR 字符另计，双栏参考边界按阅读顺序判断。
- 通用修复：图注续行／标题证明的防护、参考文献多种作者与编号格式及小字续行、摘要与作者分离、图片留白与对栏正文保护、跨栏表格／罗马编号、表注、图内短轴标签、目录复合编号和行内标题。
- 新增 paper_blocks_programs／regions／outline：伪代码和代码保存矢量裁剪，定理／定义保留为受保护的正文。提取器 hybrid-8，不新增模型或依赖，规则不按论文名、文件哈希或 arXiv 编号分支。
- 新分类为不可翻译类型时，状态、PDF 与 LaTeX 导出忽略历史误译缓存，正文缓存保留。新程序类型在块卡片显示「算法／代码清单」。
- 外部语料测试由 READFLOW_CORPUS_DIR 启用，CI 缺语料时明确跳过；合成测试覆盖相同的结构问题。SafeVLA 原覆盖阈值 294 未降低，因程序转裁剪，将其源行纳入覆盖断言。

- 最终语料：18/18 成功、488 页；固定 14 篇比较，误入翻译参考文献字符 52,816→0，吞入图像正文 1,815→0，摘要误作作者 1,621→0，程序泄露 2,803→0；短块 399→308、单行续句 112→57、孤立图注 53→23。共有目录 199 项匹配 159→166。类型／字符／位置明细均保留，规则无论文身份特判。
- 评估工具按论文隔离为串行子进程，并检查退出码、清除旧指标；拼图改用已有 Poppler，规避 MuPDF 对生成 PDF 栅格化／释放的 native abort。程序／标题证明／图注续行、白底装饰、页顶／罗马表格、图像 padding、参考格式等均有合成回归；未升级第三方组件。
- X4 最终验证：tsc、build、Web 334、桌面 100、后端 417（含语料结构和单独慢测 1）、启动器／假服务 24、CI 约束 3 项通过。18 篇、488 页全部产出假译文和拼图，render／translation fallback 为 0；label 保留项单列，不当作图表排版失败。目检补修了跨栏位图隐形边界和页宽白底误吞作者／水印的通用问题。
- 0.9.9 最终包：262,652,440 字节，SHA-256 `422fbd626d34f37e644e0fc9dd5e52897d014a3603e16162ad55d302d9a0e5ec`。nice 完整打包；control／权限／ASAR／70 个后端源文件／7 项模型哈希／86 ELF／MIT 核验通过，包内 CPU 推理和已有数据二次启动 2/2 通过。语料只读且未复制进仓库；未安装 deb、联网、调用真实翻译服务或启停预览。

## X5：导入元数据与拆块碎片（0.9.10）

- pdf_identity／pdf_frontmatter／pdf_authors 只读取首页原生文本（首页无文本时题名可尝试第二页），不启动模型、OCR 或整篇提取。导入只对新建条目自动补齐；重复条目与向已有条目添加附件不改用户字段。arXiv 出处沿用 DOI／URL 推导路径。
- 过滤占位作者、文件名题名和工具名称；多行题名与作者上标清理，作者保守解析，低置信度不填。首页侧边水印用于识别编号，排除于题名候选；X5b 更正为从编号读取首次提交年份，不采用版本日期。
- 新增只读 GET workbench/items/{id}/pdf-metadata 与显式 POST pdf-title；后者检查 expected_title，避免覆盖并发修改。工作台信息区只在可靠建议存在时显示按钮，沿用统一失败与重试提示。
- hybrid-9 修复字体切换断段、实验图板刻度误入正文与图注归属。保留合理短标题、公式导语及跨页独立图注，不以单纯降低指标为目标。
- 新增元数据合成／7 篇语料测试、字体连续性／图板／图注结构测试和信息面板离线场景。所有外部 PDF 只读，未提交到仓库；不联网、不读取真实凭据、不调用模型或启停预览。

- X5 最终语料 18/18、488 页；固定 14 篇短块 308→185、单行续句 57→26、孤立图注 23→15、无图注图表 63→35。整页图板加题注边界，图内标签保留；真实短标题、数学导语及跨页题注不强并。各篇原生文字覆盖 ≥98%，正文误入图像与参考区边界诊断继续为 0，render／translation fallback 为 0。
- 最终 tsc／build／Web 335／桌面 100／后端 431（含单独慢测）／启动器 24／CI 约束 3 均通过。7 篇题名作者断言通过；只读提案、显式应用、人工题名保护和浅深色信息区离线场景通过。中断后检查语法与 diff，重跑最终后端、语料，未启停预览。
- 0.9.10 最终包：262,640,156 字节，SHA-256 `944c3e867df3568750857fdb556c1d39ddf7d9fb5eb6a95c6a78dec1134604a1`。nice 完整打包、control／权限／ASAR／76 个后端源文件／7 个模型哈希／86 ELF／MIT 核验通过；三模型 CPU 推理与隔离已有数据二次启动 2/2 通过。产物在 frontend/desktop/dist-readflow/readflow_0.9.10_amd64.deb。

### X5b：元数据验收修正（0.9.10 重新打包）

- 日期沿用 YYYY，由 arXiv 新旧编号推导；Transformer 2017／π0 2024。水印版本号和日期不参与引用。非空旧日期不静默覆盖。
- 新增 pdf_title_tex：不执行 TeX，轻量规范化常见符号、希腊字母、上下标和格式命令；与可靠首页题名相似时择较干净结果。
- GET pdf-metadata 返回逐字段 before／after 与建议指纹；新 POST pdf-metadata 重新计算、比较完整快照，事务中按 Store 原校验写入条目和 item_state.venue。旧 POST pdf-title 只保留题名行为兼容已打开的旧客户端。
- 题名仅文件名占位可替换，作者空或全占位才补，DOI／URL／日期／出处仅补空值。前端列出全部待改项，点击才提交。真实字段及并发修改均有测试保护。
- X5b tsc／build、Web 336、桌面 100、后端 436 项通过；慢基准 1 项单独运行通过，合计 437 项。14 项元数据定向测试包含 7 篇真实样例与 π0 原元数据、六字段预览／应用、全部字段并发保护。离线界面模拟 OpenVLA 的旧条目，浅深色及应用结果通过，页面错误和外部请求为 0。
- X5b 重新打包 0.9.10：262,638,788 字节，SHA-256 `29e77a869e98d86a4c1de865225526ebe46a13e0380a609ec908e03800d17e18`。control／权限／ASAR／77 个后端源文件／7 项模型哈希／86 ELF（最高 GLIBC 2.34）／MIT 核验通过；包内 CPU 推理和隔离已有数据二次启动 2/2 通过。未启停预览或安装成品。

## X6：阅读与翻译体验（0.9.11）

- 原位模式由原生阅读器控制，paper-blocks 经注入的页面覆盖、跟页面板和导航回调接入；没有 iframe 或 postMessage。PDF 画布上方的覆盖层不接收指针，文本层／链接／批注保持在更高层。
- 新增 reading／typography 纯逻辑：锚点容量分配、结构化 runs 切分、旋转标签坐标、字号下限与溢出。DOM 测量校准字体，未变化的 runs 不重复测量。只随 PdfPane 的可视页和缓冲挂载覆盖层。
- Alt 临时看原文，拖选期间显露原文；单击单块切换、悬停全文／展开。侧栏跟当前页显示、悬停高亮、点击定位与卡片、逐条／整页复制、按需补翻。卡片 ↑／↓ 自带焦点时接管，退出恢复页面快捷键。
- 图表查看器复用现有矢量裁剪，通过新 PdfAsset 组件按缩放重绘，受像素预算限制；支持平移、缩放、标签开关、焦点循环与 Esc。图内文字偏好沿用 blockImageText。
- 原位模式不持久改写 PDF；跨锚点按区域容量近似分配，链接保留原坐标，超长内容省略并可查全文。不新增依赖或模型，后端翻译行为不变。
- X6 最终 tsc／build／Web 341／桌面 100／后端 437（含单独慢测）／工具 27 项通过；新增原位交互场景、X1b 6 组、批注 9 组、阅读 11 组回归通过。新单测覆盖排版、坐标、跨锚点 runs、复制与导航。偏好／轮询在按下抬起间重渲染的点击竞态已修复并补场景。
- OpenVLA 37 页单 Chrome 禁 GPU：599 帧间隔中位 16.7 ms、P95 33.4 ms、JS 长任务 0，首屏 621 ms、原位切换 129 ms，最多挂载 4 页；239 帧急速压力场景 P95 50 ms，原文对照为 33.4 ms，已如实记录限制。font fitting 有限校准、memo 与视口近邻排版降低开销。
- 0.9.11 最终包：262,673,584 字节，SHA-256 `b690e60d5ba2baef813de5956907f07ee9dd90460385137047a9089bf9fc2115`。nice 完整打包；control／权限／ASAR／77 个后端源文件／7 模型哈希／86 ELF／MIT 核验通过，包内 CPU 推理和已有数据二次启动 2/2 通过。未启停预览或运行／安装成品。

## X7：保持原版式的译文 PDF（0.9.12）

- 新增 layout_fonts／text／geometry／fit／page 与 paper_blocks_layout，独立实现文本归属、容量分配、字体子集、HTML 转义、55% 字号下限、压行距／截断和仅文字红删。原生行中的可编辑字形组成红删矩形，图片及非文字线条不删；写入区域避开图形与行内位图。
- 预排成功才擦原文；原注释数组临时隔离后恢复，目录只改已译标题；CropBox／MediaBox／旋转保持。原页透明组封装到背景 Form，解决 Poppler 叠加 HTML 后照片消失的兼容问题。
- 原位标题保留原字号且加粗，图内长标签允许更小字号并提供完整悬停内容。前端偏好 translationFormat 默认 layout，迁移旧结果时仍可读重排，并可离线生成原版式。
- 全文完成先原版式、后重排；单块补翻在已有 PDF 时整篇重生成。render_snapshot 串行保护两种文件，等待可取消。POST blocks/render 仅读当前语言已有缓存，不经过模型开关／凭据流程；旧单栏与 LaTeX 路径继续提供。
- 复用本地 Typst 做字形子集（MuPDF 1.26.5 完整 CFF 子集化异常），用标准 OpenType cmap 恢复 Unicode 映射；实际页面写入均通过 PyMuPDF insert_htmlbox。未引入 fontTools 或其他依赖，未参考 AGPL 实现。
- 语料检查工具 layout_corpus 按论文串行、nice、最多两线程，统计可见图片与非文字矢量，并保留 Type 3 字形／剪裁框外记录的单列计数。结果与对照拼图在 /tmp/readflow-x7/。

- X7 最终语料 18/18：614 页保持，488 页假译文输入；图片 1,404／非文字矢量 76,001 前后相等，页框／旋转／注释／链接／越界异常 0。481 块容量限制含 264 块截断、282 块原文回退、4,894 项标签保留；已处理区可见原文残留 0，2 个零宽抽取残迹单列。OpenVLA 37 页 8.158 秒（首次字体准备；复用缓存 7.806 秒）。
- X7 验证：tsc／build／Web 343／桌面 100／后端 444（慢测另跑）／工具 27 通过；新版式选择与持久化、旧译文离线生成、精确对照、三种导出、标题粗体／长标签以及原位、批注、阅读回归通过。离线截图在 /tmp/readflow-x7/screenshots/。
- 0.9.12 包：262,679,368 字节，SHA-256 `716df86fcec2d56751b95611388ca363b713c903221d734db72e3d81ae0c0710`。完整 nice 打包，control／权限／ASAR／86 个后端源文件／7 模型／86 ELF／MIT 校验通过；包内 CPU 推理、含 translated-layout.pdf 与 OCR／版面缓存的已用数据二次启动 2/2 通过。未联网、读凭据、调用真实模型、安装 deb 或启停预览。
- 附录拼图发现旧缓存中三线表被归为正文；新增 layout_regions，以表题与对齐横线确认保护区域，避免替换数据单元格。合成回归覆盖保留单元格／表头、仅翻译表题，无论文名称特判。

## X8：翻译准确度与速度（0.9.13）

- S1：论文术语候选在本机提取，一次 JSON 请求统一译法，用户术语优先；每批只携带相关术语。加入前句上下文、段首粗体结构和逐块质检／一次严格重译。侧栏可编辑术语、定向重译、筛选需核对块。离线质量工具仅读显式指定的块／译文／术语 JSON。
- S1 检查点：tsc／build、Web 345、桌面 100、后端 450（1 项慢基准跳过）通过；原有接口和缓存继续可用，未调用真实模型。
- S2 检查点：Web 348、后端 454（1 项慢基准跳过）通过；DeepSeek 网络并发从 8 逐步增至 16，429 全局减半，用户小于 8 的上限仍遵守。自动翻译默认关闭，空闲时处理新导入文献，凭据仍随请求传递，失败不无限重试。
- S2 原版式用整页译文层避免重复扫描原页资源，字体流线性去重替代全局二次比较。30 页矢量样例由 X7 的 190.232 秒降至 30.083 秒，OpenVLA 37 页 3.544 秒；单页补译分别为 1.013／0.348 秒，复用 29／36 页。只 graft 页面内容／资源，原页树、链接与批注保留。
- S3 检查点：均衡密度默认，保持原字号上限并将可容纳段落行距增至最多 1.5；紧凑保留旧密度。密度、增量签名与原页注释／CropBox／旋转回归通过。更改密度后可离线重新排版，重排 PDF 仍整篇生成。
- S4 验证：tsc／build、Web 348、桌面 100、后端 456（慢基准另跑）、辅助 27 均通过；术语编辑、相关块重译、需核对筛选、粗体、自动翻译设置及原版式／原位回归通过。
- 本轮全量语料仅运行一次；稀疏 xref 文件单篇修正复查，SafeVLA 新增文字 Form 的 clip 不再误计为原图可见性改变。最终 18 篇／614 页（488 页假译文）均通过页框、图形、链接、注释与 1pt 越界检查。图像 1,404 与非文字矢量 76,001 前后相同；35 个零宽抽取残迹单列，可见原文残留 0。
- 密度对照在 /tmp/readflow-x8/density-short/comparison-p4.png：同一份较短的假译文，比较紧凑与均衡；并保留常规长度对照。所有运行继承两核／低优先级限制，未调用真实模型、联网或启停预览。
- S4 交付：0.9.13 包 262,705,176 字节，SHA-256 `6f4170648aa453ece817bdc3dd674c8acd236a08f345688c2657ed8f8130001d`；control／权限／ASAR、93 个后端源文件、7 项模型哈希、86 ELF（GLIBC 最高 2.34）及 MIT 通过。包内 CPU 推理、已有数据服务二次启动 2/2 通过。未安装 deb、运行桌面成品或改动预览状态。

### X8b：翻译速度回归修复（0.9.13 重新打包）

- 根因：save 中的生成器每次迭代调用 storage.cache，SAM 可对一批反复加载缓存 1,090 次；同时旧批内逐块重译阻塞线程及合格块提交。改为一次缓存快照、主／重译共享并发池、最多 4 块的小批流水重译。
- 保留术语／质检／严格重译；去掉空字段和词表内部元数据、合并共享章节、按实际 wire token 合并碎批。没有降低回放的 29／42 个待重译块负荷。
- 延迟回放：OpenVLA 基线／旧 X8／修复为 15.233／18.871／13.312 秒；SAM 为 21.544／28.814／16.458 秒。估算 prompt 为 65,617／114,650／68,534 和 92,628／152,593／91,559。最大实际并发 16，主／重译墙钟重叠；不含旧缓存重复读的 CPU 开销，不代表真实 DeepSeek 耗时。
- 新 performance 字段计提取、术语、主批／重译、渲染、缓存提交、实际 HTTP 并发与 token 均值。旧数据只读复核：OpenVLA 消除 18／19 误报，SAM 消除 10／17；3 个结构失败继续提示，未改用户缓存。真实准确度与速度留给验收方。
- X8b 验证：tsc／build、Web 348、桌面 100、后端 461 全量＋新增 SAM 专项 1（慢基准另跑）与辅助 27 通过。最终包 262,687,168 字节，SHA-256 `2e14744c4c61f6e07d250d688334f232370703cbb1ed82c4c0a0bf65fca241c6`；control／权限／ASAR／96 Python 源文件／7 模型哈希／86 ELF／MIT／CPU 推理与二次启动 2/2 全部通过。

## 阅读辅助（X9，0.9.14）

- S1：论文速览走现有 ReaderAssistance / AI runtime；独立的速览范围确认、服务指纹与 reader_overviews SQLite 缓存。输入由本地块挑选，约 8 千字；页码同时校验范围与所提供证据。定向测试覆盖缓存、取消、服务变更、模型开关与未确认零调用。
- S2：术语合并采用用户词表优先；仅对可视文本层测量 Range，另画不接收指针的点线，不拆原文字节点。原位模式测量译文文字；默认开关持久化在 prefs。大小写、复数、连字符、边界及首次出现已有纯逻辑测试。
- S3：图表页延迟提取 / 缩略图加载，复用矢量放大器；筛选、跳转、放大离线场景通过。
- S4：原生目录保持原跳转目标，以同页题名匹配译文；无书签时用块标题。默认开启，可关闭；离线场景与纯逻辑测试通过。
- S5：术语卡沿用 flashcards，JSON 中记 term_key 并建按文献唯一索引；旧术语卡也比对复用，换卡组、重试及编辑后不重复。批量制卡/去重界面场景通过。五项整合后 Web 首轮 352/352 通过；最终测试与打包记录见本节后续。

- X9 最终功能回归：Web 353/353、桌面 100/100；后端全量 460 项、448 通过、12 项可选语料/慢基准跳过，无失败，另做新功能与运维回归 30/30。tsc、build、行宽与传递可达性检查通过；实际浏览器覆盖确认前零调用、缓存/取消/保存笔记、拖选高亮、引用返回、图表筛选放大、双语目录与批量制卡去重，外部请求为 0。
- X9 性能：仅一份无 GPU Chrome，2 核低优先级，OpenVLA 37 页顺序滚动各 419 帧；术语关闭/开启中位帧间隔均 16.7ms，P95 为 50.1/50.0ms，超过 33.4ms 的帧 52/53，最大挂载 4 页、50 处术语，首屏 942ms。快速跨页仍有 PDF 渲染抖动；术语未增加 P95。未重跑全量语料，只复用 OpenVLA/SAM 块数据与 fake 译文截图。
- X9 打包收尾：缩略图使用带 API 鉴权头的按需加载，401 场景回归通过；最后架构与阅读辅助定向 69/69 通过。完整 nice 打包（未跳 Web build）为 262,720,888 字节，SHA-256 `92ae9fb1461a866a7b4dd60f0a1c9b7f1d6d66a5cf195ddb0e77f7fd3afa9e9c`。control/权限/ASAR/98 Python 源文件/7 模型哈希/86 ELF（GLIBC 2.34）/MIT、三套 CPU 推理和已有数据二次启动 2/2 通过，覆盖 overview_cache 与 term_cards。未启停预览或运行桌面成品。验收日志与截图：`/tmp/readflow-x9/`。

### X9b：内部标记与提示返修（0.9.14 重打）

- 根因：X8 提示词对所有块描述 BOLD 起止标记，模型会给 heading 自行补标记；旧还原器只识别与映射完全一致的 RF 令牌。改为 `head` / `text` 字段，head 仅用于正文段首小标题，所有加粗属性由本地构造。
- `paper_markers` 兼容大小写、分隔符、空白；成对旧标记转 runs，孤立标记删除，未知 RF 删除并保留质检。在线和离线质量报告新增 internal_markers；fake 模式 `readflow-marker-variants` 覆盖模型变形。
- BlockStorage 在同一把缓存锁内清理、合并、原子写入；待修复标记先落盘，确保中途退出后还能修 PDF。干净缓存按 inode/mtime/大小记忆检查结果，普通翻译批次仅检查新写的记录，不反复扫描全库。自动缓存排版不经过外部模型门禁或凭据读取。
- SAM 只读回归在 `/tmp/readflow-x9b/sam-final/`：15 条缓存、原版式/重排正文 19/30 处、两份目录各 15 项，修复后均为 0；本地重绘 10 页、复用 20 页，3.482 秒；重排 0.637 秒。输入 JSON/PDF 哈希不变。普通作者名 Haubold 保留，检测针对内部标记而非无关词片段。
- 阅读器翻译状态合为侧栏顶部一条可折叠摘要，纯统计只在详情中，关闭按文献安全持久化；已通过浅深色、刷新后关闭保持，以及真实 SAM 缓存的双语目录无标记界面回归。
- X9b 最终验证：tsc/build，Web 356/356、桌面 100/100；后端 468 项、456 通过/12 条件跳过（SAM 只读专项已启用），定向 33 项（1 可选测速跳过）；X9 及质量/用量/实时批次/取消场景、提示关闭持久化、真实 SAM 目录清理场景全部通过。未重跑全量语料。
- X9b 最终完整 nice 包：262,722,424 字节，SHA-256 `26dd578988ad3ce3ff0ea5b17061a445beca27919d6f079bb492d913b7bbd8bd`；control/权限/ASAR/101 Python 源码/7 模型哈希/86 ELF（GLIBC 2.34）/MIT/CPU 推理通过；包内带旧标记缓存的启动修复、二次启动 2/2 通过。日志与截图 `/tmp/readflow-x9b/`，受影响版本 0.9.13 与早期 0.9.14 已在版本说明标注。
