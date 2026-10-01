# 新版翻译入口 OCR 配置误报修复（2026-10-01）

本次仅响应 09:36 的缺陷报告；其余项目工作继续暂停。未归因于旧版应用。

已在新版原 Electron 的“图书馆 → 合成文档 → 处理 → 翻译整本”复现：本地模块 ready，后端以 provider=local 接受 OCR 前置条件，实际拒绝原因为 `translation.api_key or translation.credential_ref is required`；`documents/error-messages.ts` 却将其转换成“翻译需要先在设置里配置 OCR / 翻译凭据”。此前的原设置和仅 OCR 验收没有覆盖此详情翻译入口。

修复内容：

- 缺少翻译凭据只提示配置翻译 API，继续阻止无有效模型配置的提交。
- 文档级翻译/OCR 最终载荷固定本地 provider，只允许继承页码；历史在线 provider、Token、URL 和 OCR 凭据引用不能由 overrides 重新带回。翻译模型配置不改写；复用已有 OCR 时仍不发送 OCR 配置。
- 本地模块缺失提示直接保留；包含“无需 Token”的安装提示不会再被错误转换为“需要 OCR 凭据”。

验证范围与边界：

1. 向隔离库导入一页 833 字节的合成 PDF，仅收藏，未使用私人论文。
2. 使用明确不含模型凭据、地址仅为 loopback 的合成请求，真实后端返回上述 400，证明 local OCR 前置校验已通过。
3. 实际点击新版原按钮，对所有可启动模型的网络提交进行拦截，用该真实校验响应验证前后界面。修复后同一按钮只显示“翻译需要先在设置里配置翻译 API 后再试”。没有读取请求中的模型密钥值、修改用户设置或伪造凭据绕过检查。
4. 28 项相关回归、TypeScript、JS 构建和变更空白检查通过。包括历史 OCR 配置、缺少翻译凭据、已完成 OCR 复用、缺扫描模块提示及详情页按钮相关路径。
5. 09:52:40 UTC 正常重启后，主页 HTTP 200，运行 app bundle 与本次构建 SHA 相同，模块 ready；合成文档的真实任务数为 0，调试端口 9229 已关闭。PID 152920 仅代表检查时刻。

没有真实翻译模型调用，因此本次证明的是该入口越过本地 OCR 配置检查并正确区分翻译配置错误，不代表真实翻译完成。受控的业务校验拒绝仍被既有 UI 作为 pageerror 上报，记录保留，未宣称此失败场景没有 JavaScript 事件。未扩大到重构通用 UI 错误处理。

修改文件：

- `frontend/web/src/features/library/domain/documents/error-messages.ts`
- `frontend/web/src/features/library/domain/documents/submit-actions.ts`
- `frontend/web/src/features/library/domain/documents/submit-payloads.ts`
- `frontend/web/tests/library/document-actions.test.mjs`
- `frontend/web/tests/library/local-ocr-translation-gate.test.mjs`
- 原 Web JS 产物与 HTML 缓存版本重新生成。

前后截图及响应位于 `validation/translation-ocr-gate-20261001/`。修改前副本保存在任务工作区 `translation-ocr-gate-20261001/before/`，未覆盖已有用户改动，未提交、推送、安装依赖或调用付费服务。

试用入口仍为 R9000P 本机 `http://127.0.0.1:40061/index.html?tab=research`。当前页面需刷新一次以加载本次资源。正常启动器仍为 `python3 ops/development/native_retain_preview.py start --connector --allow-ocr-download`。
