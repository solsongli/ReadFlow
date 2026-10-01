# 原壳文献库 OCR 与 Agent 检查点（2026-10-01）

> 后续真实OCR验收已完成；当前状态见 [实测交付](ocr-real-acceptance-20261001.md)。以下保留07:33检查点。

## 可使用入口

- 原 Electron/React 壳：`http://127.0.0.1:40061/index.html?tab=research`，仅限 R9000P 本机。
- 在文献库勾选一篇或多篇 → **文献库工作区** → **原文检索 / Agent** 或 **可选 OCR**。
- 普通启动：`python3 ops/development/native_retain_preview.py start --connector`。重启将 `start` 改为 `restart`；`status` 查看状态；`stop` 只停止本启动器登记的预览。
- 默认不启用 OCR 下载或模型调用。`--allow-ocr-download` 与 `--allow-external-models` 是操作人明确选择的启动参数，浏览器不能开启。后者可能发送选中文献原文并产生费用，本次尚未启用。
- 原公开 SafeVLA PDF、笔记与 Connector 导入数据保留在独立 profile；不自动使用或迁移真实私人文献库。

## 本次代码

| 模块 | 路径 | 已实现 |
| --- | --- | --- |
| 可选 OCR 安装 | `backend/library_mvp/ocr_modules.py`、`ocr_catalog.json` | 固定来源/版本/字节数/SHA-256；下载前清单；默认禁下载；进度/取消/重试/移除；隔离解包、完整性校验、原子激活；平台及既有基础依赖校验 |
| 本地 OCR 作业 | `ocr_jobs.py`、`ocr_worker.py` | 单并发有界队列；文字层优先，仅识别无文字页面；逐页进度、取消、失败重试；显式 CPU 模型路径、禁自动下载；物理页码及未旋转 PDF 坐标 |
| 解析缓存 | `store.py` | 源 SHA + OCR 清单版本区分解析修订；只发布完整版本；保留原 PDF 和既有文字解析；重启时未完成作业标为可重试 |
| 文献 Agent | `agent_service.py`、`agent_tools.py`、`agent_transport.py`、`agent_config.py` | 复用原 `RetrievalAgent` 循环；1–20 篇选中文献范围；搜索/读块工具；运行状态、取消、关闭；原文哈希、解析修订、页码和 bbox 引用校验 |
| 原壳面板 | `frontend/web/src/features/research-library/ui/ResearchWorkspace.tsx`、`ResearchAgentPanel.tsx`、`ResearchOcrPanel.tsx` | 多选工作区、模型设置、本地检索、引用回原阅读器、可选模块及作业状态 |
| 服务接线 | `backend/library_mvp/api.py`、`ops/development/native_library_service.py`、`native_retain_preview.py` | 挂载新 API；关闭前取消消费者；登记新配置/模块目录；保留原同源和内部令牌保护 |

模型地址与名称不锁供应商。首批协议为 **OpenAI-compatible Chat Completions + function/tool calling**，支持用户配置本地服务；不是所有模型协议无需适配。当前显示任务/工具进度及完整结果，不承诺逐 token 流式输出。无工具调用能力时明确返回错误并保留本地检索入口，不伪造工具结果。

模型凭据仅写入文献库专用 `agent-config.json`（当前用户 `0600`，禁止符号链接、原子替换），不读取/覆盖旧凭据、不返回密钥、不跟随重定向。回环服务可不填密钥，远程 HTTPS 服务保存时需显式填写。此文件不是系统密钥环或加密保险箱，备份应按含凭据配置处理。

## 实际验证

- 后端文献库、迁移、Connector、证据、OCR、Agent：**193 项通过**。
- 原壳 sidecar：**8 项通过**，包括重启持久化与 Connector 并发/端口共存。
- 前端 TypeScript 通过；文献库与原阅读器笔记相关 **5 个测试文件通过**；`npm run build` 成功，未安装依赖。
- 2026-10-01 07:27 UTC，真实 Electron 页面实测：原壳选择公开 SafeVLA → 本地检索 `risk` → 6 处来源 → 引用跳转 → 原阅读器实际显示第 32 页；`pageErrors=[]`。
- 原壳自由配置表单实测：本地空密钥可保存表单，远程空密钥不能保存；本次未实际保存任何模型配置。
- 原壳 OCR 清单实测：18 个固定文件、144.8 MiB；未授权下载按钮禁用。
- 证据位于 `validation/ocr-agent-20261001/native-ocr-agent-report.json` 及同目录三张截图。测试代码不把离线模型响应标为真实 AI 验收。
- 原有 14 个用户修改文件与 `workspace-baseline.json` 的 SHA-256 校验一致；未提交、推送、公开发布。

一次沙箱内 ASGI 回归卡于线程唤醒，已安全终止；带硬超时的主机复测及全套回归均通过。不是将未完成测试计为通过。

## 尚未验证与批准范围

### 实际 OCR

尚未下载/安装/执行真实 OCR 包和模型。固定清单共 **151,802,982 字节（144.8 MiB）**，含：

- RapidOCR 3.9.2、ONNX Runtime 1.30.0 CPU、OpenCV headless 5.0.0.93、NumPy 2.3.5 及全部新增传递依赖。
- PP-OCRv5 mobile 检测/识别、PP-OCRv4 mobile 分类模型，取自 RapidAI/RapidOCR ModelScope 固定 `v3.9.2`。
- Python 包取自官方 PyPI `files.pythonhosted.org`。ANTLR 4.9.3 仅静态提取 `src/antlr4/` 与许可，不运行 `setup.py`。
- 复用现有 Python 3.11、Pillow 10.4.0、requests 2.32.5。不开系统包安装，不安装新 Python 或 GPU 驱动。
- 目标目录：`.retain-native-preview/profile/chromium/data/research-library/optional-ocr/`；预计预留约 700 MiB，最终解包占用尚未实测。
- 新合成样本为 3 页：1 个文字页、1 个中英文扫描页、1 个旋转 90° 扫描页。SHA-256：`9825372570fe65f079e926f5b8c671089e296f087e2effc38ca0c2b7bab35b65`。只对合成内容做真实识别、页码/bbox、缓存、取消验证，不上传页面。

运行库组合兼容性、扫描文字准确率、真实安装/卸载及下载重试尚需实际验收；现有 14 项 OCR 测试使用合成引擎/模拟下载，不能替代真实 OCR。

### 实际 AI

尚无获准的服务地址、模型与调用预算。需要用户选择兼容服务，并在本机输入凭据（不要发到聊天）；另确认可发送的公开/合成内容及调用上限。自由配置要求不等于授权任意费用或私人资料外发。已有模型循环、错误、取消、引用越界等验证仅为离线接口测试。

引用校验保证来源身份、原文范围及物理页码，**不自动证明模型论断得到原文支持**；结果继续标注人工核对。

## 许可与范围

保持 RetainPDF 原 MIT 归属，不移除原作者声明，不声称此次增量实现是完全独立重写。可选 OCR 包的许可证随分发包保留；RapidOCR/PaddleOCR 模型、ONNX Runtime 等需保留各自归属。既有 PyMuPDF 的 AGPL/商业许可仍是未来开源发行必须评估的事项；本阶段不更改整个项目许可证，不公开发布。

本阶段新增能力位于文献库工作区；旧首页 OCR/翻译流水线的默认配置未被替换。公式/表格结构、阅读顺序质量、跨论文综合结论、语义检索与全部 Zotero 字段不在本轮真实验收结论中。

## 下一步

1. 获准后仅启用固定 OCR 下载清单，真实安装并对合成样本识别，记录版本、耗时、文本、坐标、缓存和失败信息。
2. 用户选定模型接入与预算后，只使用获准的公开/合成内容验收真实工具循环和引用；遇到不支持工具调用的模型展示明确能力限制。
3. 保留正常原壳预览，结束浏览器验收后关闭临时调试端口；继续沿原界面整合，不另做替代壳。
