# RetainPDF 科研阅读版本（ReadFlow）：私有交接快照

## 最新状态（2026-10-04 下午，ReadFlow 0.9.6 已打包待安装：块级翻译）

- **翻译重构第一阶段（X1 / X1b / X1c，Astra 实现，Claude 验收）**：
  - **拆块**：PyMuPDF 把 PDF 拆成带类型和坐标的块。图、表、公式裁成矢量 PDF。
  - **翻译**：逐块批量翻译，同时最多 2 个请求，凭据只放在内存里。
  - **阅读器**：单击块弹出译文卡；已有译文时自动进入块模式。
  - **排版与导出**：内置 Typst 生成单栏译文 PDF；可导出 LaTeX 工程。
  - 代码在 `backend/library_mvp/paper_blocks_*.py` 和 `frontend/web/src/features/paper-blocks/`。数据目录 `paper-blocks/` 已登记到 `data_layout.py`。
- **未新增模型或依赖。** 下一阶段可接入 PP-DocLayout-S（4.8MB）和 PP-OCRv5 mobile（约 21MB）。这些需要打包时联网下载，要先征得用户同意。
- **安装包**：`readflow_0.9.6_amd64.deb`，SHA256 `73e0f0a4a3a8b1a13169bac89e9502f8e927c40de6f8310f449d0a6f4c05a5ae`。
  - 用户不在、无法输入密码，所以**还没有安装**，本机仍是 0.9.5。
  - **不要用 0.9.6 去打开真实数据目录**：它会新建 `paper-blocks/`，0.9.5 遇到不认识的目录会拒绝启动。安装：`sudo dpkg -i frontend/desktop/dist-readflow/readflow_0.9.6_amd64.deb`。
- **测试**：web 329、桌面 99、后端 325。完整 Electron 的 `--headed` 二次启动通过（数据含 paper-blocks 缓存）。
- **事故**：验收时误调用了一次**真实 DeepSeek**。
  - 原因：预览里的翻译设置是 DeepSeek（deepseek-flash）；后端直接请求模型，浏览器的路由拦截管不到。
  - 发出内容：公开论文 BabelDOC 的 123 个文本块，约 3–4 万 token。
  - 防范：此后在 Playwright 里把 `/blocks/translate`、`/assistance/translate` 的请求体改写成本地假服务。

## 此前状态（2026-10-04，ReadFlow 0.9.5 已在本机安装：仓库整理与收尾）

- **M1（Astra 实现，Claude 验收）**：
  - 删除 9 个上游 GitHub 工作流，新增 `readflow-ci.yml`：只跑 Web、桌面、文献库测试；不响应标签，不用 secrets，不发布。
  - 发布约定见 `docs/ops/readflow-release.md`：标签只用 `readflow-vX.Y.Z`。
- **六项修复**：
  - 夜间模式下位图保持原色；
  - 闪卡「让 AI 出题」（沿用 R4 的隐私确认）；
  - 画布导出 PNG；
  - 没有笔记时隐藏「查看全部 0 条」；
  - Connector 状态接口只返回 ReadFlow 字段；
  - 导入 PDF 时读取 Author / Subject / Keywords。
- **验收补修**：PNG 导出原先会在英文单词中间断行、把来源文字压扁、缺少批注色条、留白过大。Claude 新增 `thought-canvas/domain/text-wrap.ts` 和 5 项测试，修复后重新打包。
- **测试**：web 322、桌面 99、后端 285 + 1 项慢基准跳过、CI 约束 2 项。
- **二次启动**：
  - 完整 Electron 必须在**有界面的桌面**上验证：`node frontend/desktop/scripts/check-existing-data.mjs <unpacked> --headed`。在 headless 沙箱里窗口不会就绪。
  - 另有包内服务检查脚本 `ops/development/check_packaged_restart.py`。
- **安装包**：`readflow_0.9.5_amd64.deb`，224,529,672 字节，SHA256 `ac3c716d20eca5755517490d1ffb3139c1d3229792887aea59d8c00827bfe92b`。已安装，并在真实数据上启动：文献库、AI 服务、Connector 23119 均正常。
- **快照**：ReadFlow 提交 `8ba567b`，首次运行新 CI。
- **假服务端口**：以**当次**预览日志为准。端口没有被挪开时用 41160，不要沿用旧日志里的 41161。

## 此前状态（2026-10-03，ReadFlow 0.9.4 已在本机安装：全新阅读器）

- **用户选定方向**：阅读器选 A（批注工作台）+ B（自由画布），要求「完全和现在不一样，一看就是经常读论文的人做的」。
- **新阅读器**：分 R1–R5 从零重写，代码在 `frontend/web/src/features/paper-reader`。直接使用 pdf.js 4.8（Apache-2.0），不复用上游阅读器代码。
  - R1：原生嵌入工作台；引用 / 图表悬停预览、返回栈、目录、搜索、书签、白 / 米 / 夜纸色、专注模式、对照阅读、复制为引用。
  - R2：`annotations` 表（ReadFlow 自有 schema），5 色语义高亮、下划线、便签、框选截图、手写、批注栏、Markdown 导出；旧批注幂等迁移。
  - R3：思考画布（`canvases` / `canvas_nodes` / `canvas_edges`），与原文双向联动，导出 Markdown 提纲。
  - R4：选中即译（轻量文本接口，复用翻译配置）；问 AI（复用 T4 运行时，按文献做隐私确认，回答带页码引用）。
  - R5：闪卡（`decks` / `flashcards` / `card_reviews`，SM-2 变体，凌晨 4 点切换学习日）、复习视图；**旧阅读器与 `frontend/packages/reader` 已整体删除**。
- **严重缺陷已修**：R2 / R3 新增的 `annotation-images` / `canvas-images` 不在数据根白名单，导致重启后无法启动。现在目录名集中登记在 `backend/library_mvp/data_layout.py`，由源码扫描测试守卫。打包版已实测连续两次启动正常。
- **安装包**：`readflow_0.9.4_amd64.deb`，SHA256 `d72865abd5c87c161470c44bc441e922fdd1a4bc12377e6a8e048321e362b244`。
- **测试**：web 314 项；桌面 99 项；后端 281 项 + 1 项慢基准。web 测试数下降是因为删除了旧阅读器包自带的测试。
- **原创比例**：按基线路径统计，新增代码约占 10.3%。上游的翻译流水线和 Rust 后端体量大，见 `docs/readflow/代码来源清单.md`。
- **环境注意**：2026-10-03 04:08 机器硬死机过一次。当时用户的 RoboTwin GPU 评测与测试负载重叠。之后委派 Astra 一律用低负载：前端并发 2、后端串行、单个 Chrome 加 `--disable-gpu`、打包时 `nice`。
- **假服务验收**：先启动预览，从日志读出实际 AI 端口，再启动 `readflow_fake_openai.py`。预览会自动避开被占用的端口。

## 此前状态（2026-10-03，ReadFlow 0.9.3 已在本机安装）

- **T11**：彻底移除旧版界面，只保留 `workbench.html` 与 `reader.html`。`frontend/web/src` 由约 8.3 万行减至约 1.8 万行。来源统计见 `docs/readflow/代码来源清单.md`。MIT 许可与「关于」说明保留。
- **用户的「不被原作者查重」诉求**：已向用户说明，不做表面改写，也不删除版权声明。正确路径是重写关键模块；阅读器重做方案已出设计稿，见画布第 5 行。
- **T12 翻译模块**：
  - 根因：导入不建翻译任务。新流程是：工作台后端 `POST /api/research/workbench/items/{id}/translate`，登记附件后调用 Rust「从文献发起翻译」接口，请求体与旧上传逐字段对齐。
  - 预检、进度、错误映射、取消、完成后阅读器自动具备对照 / 译文。
  - 验收用的假模型服务：`ops/development/readflow_fake_openai.py`。端到端已在预览中跑通，提交被拦截核对只指向 127.0.0.1。
- **T12.1**：同一 SHA-256 的 PDF 再导入时复用已有条目（只在回收站中则恢复），不改 Zotero / CSL。
- **安装包**：`readflow_0.9.3_amd64.deb`，SHA256 `043d22af6c179f09c7c751c88a4e07b5b2754ab3f8aa441e69235f0212ea774a`。
- **测试**：web 910 项；桌面 98 项；后端 242 项。
- **待办**：
  - 用户选定阅读器设计方向（A 批注工作台 / B 自由画布 / C 闪卡）后开发；
  - 用户配置翻译服务，并授权后做一次真实模型测试。

## 此前状态（2026-10-03，ReadFlow 0.9.2 已在本机安装）

- **用户操作**：用户要求卸载本机 RetainPDF 4.2.5（旧数据保留在 `~/.config/retain-pdf-desktop`，未迁移），改装 ReadFlow。当前已安装 **0.9.2**（`/opt/ReadFlow`），数据在 `~/.config/ReadFlow`。
- **0.9.1（T9）**：Zotero Connector 正式化。
  - 设置 → 文献库新增开关，默认开启。
  - 23119 被占用（例如 Zotero 桌面版）时不抢占、不崩溃，界面显示状态；`GET /api/research/connector/status`。
  - 环境变量 `RETAIN_PDF_RESEARCH_CONNECTOR_PORT` 仍优先。
- **0.9.2（T10）**：
  - 界面字体（预置 + 本机 `fc-list` 字体）、7 档文字大小（Ctrl = / - / 0）、笔记字体；阅读器界面同步，PDF 不受影响。
  - 迁移旧版「译文排版字体」（同一存储键）。
- **安装包**：`readflow_0.9.2_amd64.deb`，SHA256 `e9115609eee296af9ee512867040a6cd4a714614b18339fbdf2866ec6b84dedc`。
- **测试**：web 1996 项 0 失败；桌面 98；后端 222。
- **待清理**：Connector 状态接口仍带上游内部字段（`client: RetainPDF`、`product_version 4.2.5`、`partial_acceptance`）。
- **Astra 的 Fast 模式**：用户允许使用；调用时加 `-c 'service_tier="priority"'`，不改 `~/.codex/config.toml`。

## 此前状态（2026-10-02，ReadFlow 0.9.0 交付）

- **目标**：用户要求「和 Astra 配合，交付一版接近正式软件的版本，UI 按 Apple 风格」。
- **分工**：Claude 负责规划与验收（任务书、代码审阅、复跑测试、Chrome/打包版实测）。Astra（本地 Codex CLI，gpt-6-astra，max 推理）负责实现。
- **已完成任务**（每项在 [工作台文档](docs/ops/planning/readflow-workbench/README.md) 中有对应小节）：
  - T1：Apple 风格外壳、侧栏、Mail 式列表、详情面板；
  - T2：书桌仪表盘；
  - T3：阅读器嵌入，含明暗同步、续读进度、批注联动；
  - T4：工作台内设置，含翻译、本地 OCR、AI 伴读、术语表、关于；
  - T5：笔记空间；
  - T6：首启欢迎页、拖放导入、容错、2000 条窗口化、快捷键面板，接手前的 4 个旧测试失败已全部修复；
  - T7：ReadFlow 品牌、图标，Linux deb 打包，孤儿进程防护；
  - T8：版本号、用户文档、正式打包。
- **产物**：
  - 安装包 `frontend/desktop/dist-readflow/readflow_0.9.0_amd64.deb`，由 `node frontend/desktop/scripts/package-readflow-linux.mjs` 离线生成；
  - 用户文档 `docs/readflow/`。
  - 打包版安装到 `/opt/ReadFlow`，数据在 `~/.config/ReadFlow`，可与已安装的 RetainPDF 4.2.5 并存，不读取旧库。
- **最终安装包**：`readflow_0.9.0_amd64.deb`，227,820,620 字节，SHA256 `f561f5ad9ef7a77b0f86c8a495512001c35f4abc7881065942b36b613e70abca`。
- **测试基线**（2026-10-02，T8 正式构建后）：web 全量 1982 项 0 失败；桌面 88 项全过；后端核心 + 工作台 + 笔记 208 项全过。
- **打包版端到端实测**（Claude，隔离 HOME，未安装 deb）全部通过：
  - 首启欢迎页；
  - 导入合成 PDF（201）、文献库与详情；
  - 阅读器打开、新建笔记自动保存；
  - 「关于」显示 0.9.0；
  - 页面错误 0。
  - 只向主进程发 SIGTERM 后，所有后台子进程有序退出，无残留。
- **注意**：
  - 预览启动器传 `--user-data-dir=profile/chromium`，预览文献库在 `.retain-native-preview/profile/chromium/data/research-library/`。
  - 桌面壳改动 userData 逻辑时必须尊重这个开关。
- 用户已从 GPT 代理切换到 Claude 继续开发；下文「后续代理按用户要求使用 GPT-6 Astra」一句已失效。Astra 现在作为 Claude 调度的实现助手使用。

## 早先状态（2026-10-01，Claude 接手后）

- 用户恢复开发，方向是把 UI 与逻辑整体改造成专业的科研辅助软件（文献管理 + 双语翻译 + AI 伴读 + 笔记）。设计定稿与分阶段计划见 [ReadFlow 工作台](docs/ops/planning/readflow-workbench/README.md)。
- **阶段 1 已完成**：新入口 `frontend/web/workbench.html`（外壳、标签页、命令栏、三栏文献库、多分组、书桌、只读翻译状态），预览启动器已把它设为 Electron 首页；旧界面经「设置 → 打开旧版界面」进入。接手前已存在的 4 项前端测试失败记录在该文档「验证」一节。
- Git 约定（用户选择）：在本机原目录直接开发、不提交；需要备份时整体打快照推到私有仓库 Lsy-aia/ReadFlow 的 `checkpoint-20261001` 分支，不推标签。
- 在 VSCode 内启动预览必须 `env -u ELECTRON_RUN_AS_NODE …`，见工作台文档「运行」一节。

以下为 GPT 交接时的原始记录（2026-10-01 UTC），保留供追溯。

---

记录时间：2026-10-01（UTC）。这是当前研发工作快照，不是已发布安装包。

## 项目与来源

保留 RetainPDF 原 Electron / React 壳、导航和阅读器，在其中加入文献管理、Zotero 导入与实验性官方 Connector 接收、本地 OCR、持久批注与笔记。独立 research-library 网页只是保留的早期原型，不能替换原壳产品方向。

上游：https://github.com/wxyhgk/retain-pdf ，原浅克隆基线提交 `857868407aeace94ccf5d8cf0bcf90aecae3b7bf`。本仓库以当前文件状态创建独立初始提交；保留 MIT LICENSE、版权归属和第三方许可文件，不宣称包含完整上游 Git 历史。既有 Linux 改动一并保留。

## 接手顺序

1. 阅读 [原壳运行与验收](docs/ops/planning/research-library-mvp/native-shell-preview.md)。
2. 阅读 [真实 Connector 验收](docs/ops/planning/research-library-mvp/official-connector-acceptance-20261001.md)。
3. 阅读 [原设置页本地 OCR 验收](docs/ops/planning/research-library-mvp/settings-local-ocr-acceptance-20261001.md)。
4. 阅读最新 [翻译 OCR 配置误报修复](docs/ops/planning/research-library-mvp/translation-ocr-gate-fix-20261001.md) 与 [检查点](docs/ops/planning/research-library-mvp/translation-ocr-gate-checkpoint-20261001.json)。
5. （2026-10-01 新增）阅读 [ReadFlow 工作台](docs/ops/planning/readflow-workbench/README.md)。

较早文档中“未实现/未验证/未提交”的说法是当时记录，以上述更新日期与对应检查点区分；真实翻译模型验收仍未完成。

## 已验证与限制

- 原壳文献管理、PDF 导入、分类与元数据、原阅读器批注和笔记持久化已通过对应记录中的验收。
- 官方 Connector 5.0.216 / Firefox 156.0.1 的合成页面和公开 arXiv 样本保存实测通过；不等于所有出版商、登录 PDF、合集/标签弹窗或全部格式兼容。
- 本地 CPU OCR 经原设置页与原阅读器验证；原生文字、扫描页和旋转扫描合成样本通过，复杂公式/表格/多栏质量未全面验收。
- 最新翻译错误提示修复通过 28 项相关回归、TypeScript 和前端构建；实际按钮以安全拦截方式复现了缺少翻译凭据时的显示。未读取用户密钥或调用真实模型，不表示真实翻译通过。
- 尚未完成正式发行包、异地完整库恢复、全量依赖许可证发行评估。PyMuPDF/MuPDF 等需要继续核查。

## 数据与运行

本快照不含本地文献数据库、用户导入 PDF、用户凭据、浏览器配置、node_modules、Python/桌面已安装运行时、下载的 OCR 模型或进程日志。上游原本已跟踪的测试资料和字体继续保留；新验收截图/报告使用隔离测试库。上游遗留的三个绝对路径测试 PDF 符号链接只保留链接文本，未读取或复制目标。

R9000P 原目录为 `/home/lsy/Documents/LeoProjetcs/Retainpdf/retain-pdf`。当前隔离预览入口曾在 `http://127.0.0.1:40061/index.html?tab=research` 验证；存活状态以本机启动器检查为准。

```sh
python3 ops/development/native_retain_preview.py status
python3 ops/development/native_retain_preview.py start --connector --allow-ocr-download
```

这两个命令依赖原机现有构建运行时。新机器仅克隆源码不会自动获得这些运行时或已安装模型；先阅读运行文档和构建配置，不应宣称克隆后立即可运行。不要从旧真实库直接试迁移。

## 当前约束

（2026-10-01 更新）开发已按用户指示恢复，范围与阶段见工作台文档。以下安全约束继续有效：不得读取/展示密钥、上传私人论文、调用付费模型或公开发布；真实模型调用（翻译验收、AI 伴读）须用户另行授权模型与预算。

原记录：用户暂停了后续开发；本次仅授权私有 GitHub 备份。接手后先只读核对状态，继续开发需用户明确指示。后续代理按用户要求使用 GPT-6 Astra、正常服务档（已失效，见上文）。

首次保存使用 `checkpoint-20261001` 分支，避开上游仅由 main/master/tag 触发的 CI/发布；不推标签。后续启用 CI、发布或切换默认分支前须检查原有工作流的自动部署行为。
