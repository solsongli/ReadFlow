# T12 翻译链路验收

本轮未调用真实模型、未安装或运行成品、未打包。以下真实 Rust 链路由验收方运行。

## 本地假服务

```sh
python3 ops/development/readflow_fake_openai.py --port 48991
```

脚本仅监听 `127.0.0.1`，只使用 Python 标准库，不访问上游，不记录请求正文或 Authorization。
使用空闲端口即可；脚本拒绝 23119。退出按 Ctrl+C。

工作台「设置 → 翻译」填写并保存：

- 服务：自定义 API。
- API URL：`http://127.0.0.1:48991/v1`（更换端口时同步修改）。
- 模型：`readflow-test`。
- API Key：任意非空 ASCII 测试文字；不要填写真实凭据。
- 并发数：建议 1，便于观察。
- 译文排版字体：选择 `/api/v1/fonts` 列表中已安装的字体。

只保存即可，不需要点检测接口。首次用一页简单英文文字 PDF 验收；扫描件另需在「本地 OCR」安装并就绪。
先用预览启动器 restart 同步当前前端及 Python 路由；不要使用已安装 0.9.2 的窗口，也不必启用 Connector。

## 请求协议

流水线使用 OpenAI 兼容的 `POST /v1/chat/completions`，包含 `model`、`messages`、`stream`，部分阶段另有 `response_format`。
非流式返回 `choices[0].message.content` 和 `finish_reason: stop`；流式返回 SSE `data: {...choices:[{delta:{content:...}}]}`，以 `data: [DONE]` 结束。
本脚本同时提供 `/v1/models`，支持现有 tagged 批量、translations JSON 以及领域提示 schema。
纯文本加「【译】」前缀返回，结构化批量保留 item_id。它用于验证通路，不模拟真实翻译质量或复杂公式修复能力；复杂论文可能触发上游内容质量校验。

## 验收步骤

1. 未配置时点击「翻译全文」：就地引导，不创建任务。
2. 配置假服务，导入文字 PDF，点击「翻译全文」；重复提交只复用排队/进行中任务。
3. 打开阅读器，观察 OCR/翻译/排版阶段。完成提示出现后，原标签自动刷新，可切换源文件、对照、翻译文件，并保留页码。
4. 修改假服务以返回 401、429 或停止服务，可验收失败分类与重试；原始错误详情已脱敏。
5. 进行中点击取消，随后可以显式重试。单独删除译文未开放：现有删除接口会删除文献/任务及相关文件，不能冒充只删译文。

## 请求体真源

前端复用 `createHeadlessTranslationSettings.load()` 的生效配置、`createDeveloperConfigResolver` 和旧上传的 `buildOcrPayload / buildTranslationPayload / buildRenderPayload`。
字体继续用同一 `RENDER_FONT_STORAGE_KEY`，术语表继续传 `glossary_id`，OCR 为现有本地优先文字层流程。
浏览器/桌面配置由前端传入 grouped JSON；Python 不另存凭据。

Python 先 `NativeBridge.register()`，再调用原生 `POST /api/v1/documents/{sha256}/translate`。
这个原生接口从文档绑定 `source.upload_id`，再调用与旧 `POST /api/v1/jobs` 相同的 JobsFacade；客户端 source 留空，不能指定任意上传或源 URL。
黄金夹具由真实旧构造函数和 `submitJobRequest()` 在假 fetch 下生成；测试补入原生文档端点负责绑定的 upload_id 后，断言其余分组及字段与旧上传请求完全一致；不是另写一份固定 JSON 当作黄金样本。
