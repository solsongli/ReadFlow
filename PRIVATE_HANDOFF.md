# RetainPDF 科研阅读版本（ReadFlow）：私有交接快照

## 最新状态（2026-10-02，ReadFlow 0.9.0 交付）

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
