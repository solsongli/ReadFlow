# 原设置本地 OCR 替换验收（2026-10-01）

已在原 RetainPDF Electron/React 壳完成“设置 → 接口设置 → 本地 OCR 识别”，并从原“添加 PDF → 仅 OCR 模式”提交合成扫描文档，通过原任务管线生成产物，在原阅读器 Markdown 面板实际显示。此记录接续 `ocr-real-acceptance-20261001.md`；上一阶段的文献库 OCR 工作区仍共用同一模块。

## 可试用入口

R9000P 本机：`http://127.0.0.1:40061/index.html?tab=research`。原窗口也已启动；关闭窗口隐藏到原托盘。未设置系统自启，未生成新的发布安装包。

在仓库根目录执行：

```sh
python3 ops/development/native_retain_preview.py start --connector --allow-ocr-download
python3 ops/development/native_retain_preview.py restart --connector --allow-ocr-download
python3 ops/development/native_retain_preview.py status
```

已有模块显示“RapidOCR · 就绪”，本次不需重新下载。原设置下方翻译 API 独立保留。添加 PDF 后选择“仅 OCR 模式”即可先做本地解析，无需配置在线 OCR Token 或翻译模型。

最终正常重启检查时间为 **2026-10-01 09:28:39 UTC**：PID `133343`，主页、模块 API、已完成任务与 Markdown 均 HTTP 200；模块仍 ready，任务仍 succeeded。临时 CDP 调试端口 9229 已关闭。运行状态证据为 `validation/settings-local-ocr-20261001/final-normal-restart.json`，PID 仅代表该检查时刻。

## 行为与兼容边界

- 原设置不再展示 Paddle/MinerU 提供商选择、OCR URL/Token 输入，改为共享模块状态、引擎/模型版本、下载大小与安装生命周期操作。
- 原首页配置就绪和保存流程允许只使用本地 OCR；原提交只发送 `provider: local` 和页码范围，翻译配置与 OCR 分离。
- 旧 OCR 配置及凭据引用保留，不解析旧 OCR vault，不将其重新返回界面；空 OCR 设置不会清除旧配置。翻译凭据的既有读写逻辑独立保留。本轮没有读取或展示真实密钥。
- 原 Python 解析驱动优先提取文字层，仅无文字的页面调用已安装的 RapidOCR CPU 模块；模块未安装时给出明确提示，不回退在线 OCR。
- 原管线与文献库使用同一个宿主指定模块目录；任务请求不能指定任意运行路径。模块使用共享运行锁，安装和移除使用排他锁。
- 本地驱动产出沿用 `document.v1`、原 Markdown 及产物发布流程，保留源 SHA-256、解析修订、物理页码、旋转和未旋转 PDF 坐标。
- 为兼容现有 Rust 调度，配置中 `local.kind` 保留 `local_command`，但 `credential:null`、`options:{}`；Python 已固定注册内置 CPU 驱动，旧 `RETAIN_LOCAL_OCR_COMMAND` 不会被执行。这是既有 worker 调度契约，不是用户可传入命令。

## 实际验收

原 UI 提交的任务 `20261001091356-3a7ad3` 成功，上传 ID `20261001091356-7423a7`。执行工具在点击后短暂断连，恢复后查询到了该成功任务，未重复提交；原始 HTTP 请求体没有捕获，证据中已明确注明。针对提交体的断言由单元测试覆盖。

测试 PDF 只有本任务生成的文字和图像，共 3 页，SHA-256 为 `9825372570fe65f079e926f5b8c671089e296f087e2effc38ca0c2b7bab35b65`。

| 验收项 | 结果 |
| --- | --- |
| 原设置实际界面 | 本地 OCR 显示 RapidOCR 3.9.2、PP-OCRv5-mobile + PP-OCRv4-cls、144.8 MiB、就绪 |
| 原任务管线 | workflow=ocr、provider=local，最终 succeeded；3 页、7 个文字块 |
| 文字层优先 | 第 1 页来源 native，第 2、3 页来源 ocr |
| 中英文扫描页 | 识别到 `Local citation evidence on page two.` 和“本地文献证据测试” |
| 旋转页与坐标 | 第 3 页保留 90°旋转和物理页码 3，识别“扫描页引用与页码”；所有 bbox 在页面范围内 |
| 阅读产物 | 原阅读器实际打开第 2 页，Markdown 面板显示全部中英文；未产生 JavaScript 异常 |
| 正常重启 | 模块、成功状态和 Markdown 均保留；无调试端口 |

证据目录：`validation/settings-local-ocr-20261001/`。包含 `settings-check.json`、提交恢复说明、任务结果、标准化文档、内容与坐标核验、原阅读器核验及最终重启状态。

实际截图：`original-settings-local-ocr-final.png`、`original-ocr-complete.png`、`original-ocr-reader-content.png`。设置截图遮挡了密钥输入区域。已在本地检查像素；Library 保存未成功，工具报告 prepared upload 不可用，未获得 Library 文件 ID。

## 实测发现并修复

1. 原 composition 自有状态仍把全新桌面视为“未完成首次配置”，阻止仅 OCR 提交；现本地功能可直接使用，翻译仍保留独立提交检查。
2. 隔离预览原先启用 remote 任务模式却关闭 jobsd，导致排队；仅此预览改为既有 `in_process` 模式，正常桌面的监督策略不变。
3. `local.kind=local` 未匹配旧 Rust provider worker 分支，触发不支持的 transport；恢复其兼容类型，并验证 Python 始终选择内置 CPU 驱动。
4. 旧 Rust 的 OCR 详情将 Markdown 指向未注册的 `/ocr/jobs/.../markdown`，原阅读器因此显示无产物；Reader 宿主对 OCR 使用已注册的 `/jobs/.../markdown` 标准路由，翻译任务保留其发布地址。旧 Rust 原始 API 投影字段尚未重构。
5. 打包 sidecar 原先硬编码源码布局导入 AI 包；改为在应用自有的源码或打包布局查找同一 `retainpdf_ai`，并验证隔离打包生命周期。未做模型调用。

## 代码与测试

关键实现路径：

- `frontend/web/src/features/credentials/`：原设置组件、本地就绪与保存、旧凭据兼容。
- `frontend/web/src/features/research-library/ui/ResearchOcrPanel.tsx`：原设置与工作区共用模块管理。
- `frontend/web/src/app/home/create-home-composition.ts`、`features/ingest/domain/workflow/`：首次配置门槛、原本地 OCR 提交。
- `frontend/web/src/features/reader/domain/host/data.ts`：OCR Markdown 标准路由适配。
- `frontend/desktop/src/main/desktop-config.js`、`backend-env.js`、`main.js`、`scripts/prepare-app.mjs`：宿主配置、共享模块根目录、原管线与打包。
- `backend/pipeline/retainpdf_pipeline/ocr/ocr_provider/local_cpu_driver.py`、`drivers.py`、`provider_pipeline.py`、`backend/config/ocr_providers.json`：本地原管线。
- `backend/library_mvp/ocr_modules.py`、`ocr_jobs.py`、`ai_runtime.py`：共享锁与打包导入。

本轮定向回归：设置/原提交 **63 项**、文献库 **19 项**、Reader 路由新增 **2 项**与现有 Markdown **14 项**、桌面配置与环境 **6 项**、Python 原管线及模块 **29 项**、Agent service **16 项**及打包生命周期 **1 项**通过。没有把离线 mock 算成真实 OCR 或模型验收。

TypeScript、桌面 ESLint、完整前端构建通过；最终 Reader 修改后再次通过 TypeScript、相关 16 项测试与 JS bundle 构建。`git diff --check` 通过。现存 CSS 选择器、bundle 大小及部分构建提示仍保留。未重跑整个仓库所有平台测试，也未生成发布安装包。

原保护文件中的授权最小改动已保留修改前副本；完整本轮源码/测试路径和当前 SHA 见 `settings-local-ocr-checkpoint-20261001.json`。未 reset/clean/stash，未提交、推送或公开发布，没有更改系统驱动、真实文献库或浏览器日常配置。

## 仍未验证的范围

本次是清晰合成扫描件闭环，不代表复杂多栏、公式、表格、手写或低质量扫描的识别质量。含少量页码/水印文字的混合扫描页仍可能被判为有文字层。OCR 不自动写回 PDF 隐藏文字层。模块实际安装生命周期沿用上一阶段的真实验证，本轮没有重新下载和卸载。

翻译和 AI 配置保持独立；本次未调用真实模型，预览外部模型开关仍关闭，不能宣称真实翻译或 Agent 已通过。原 AI 服务在隔离预览中未启动，相关配置探测可能显示不可达。已有 PyMuPDF 等依赖的许可证与开源分发审查仍需单独完成，未改变项目总许可证。
