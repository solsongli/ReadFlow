# 科研文献库独立前端

本地首版使用独立入口 `frontend/web/research-library.html`，同源请求 `/api/research`。不读取真实 Zotero 库、不改写旧 RetainPDF 数据，也不借用原 reader 的私有源码。

## 运行与检查

在仓库根运行 `python3 ops/development/research_library.py --demo`，启动器选用已安装的 Python 运行时及独立数据目录；演示论文是自写合成文件。浏览器入口为 `http://127.0.0.1:41030/`。

仅构建此入口：

```sh
node frontend/web/scripts/build-research-library.mjs
```

局部检查（工作目录 `frontend/web`）：

```sh
./node_modules/.bin/tsc --noEmit -p src/app/research-library/tsconfig.json
node --import ./tests/helpers/register-jsx.mjs tests/research-library/model.test.mjs
node --import ./tests/helpers/register-jsx.mjs tests/research-library/api.test.mjs
```

构建只写 `dist/research-library/`，包含 React bundle、样式、与 react-pdf 匹配的 PDF.js worker、CMap 和标准字体。不会清理其他入口或 `dist/chunks/`。

## 模块边界

- `api.ts`：同源 API、错误与下载链接。导出菜单可下载原始迁移数据 JSON，取回未覆盖字段、原 HTML 与来源附件声明。
- `model.ts`：输入转换、来源身份和页码校验。
- `ImportDialog.tsx`：JSON / 用户触发的本机 Zotero 只读快照、预览、确认和完整提示 JSON 下载。
- `MetadataForm.tsx`：书目、合集、标签。
- `PdfReader.tsx`：PDF.js 单页阅读、文字选择、持久双语笔记及页码跳转。
- `App.tsx`：列表、筛选、详情、迁移缺口和原文证据界面。

笔记以 API / SQLite 为真值；不使用 localStorage 保存科研笔记。页码使用物理页序，API 为从零开始的 `page_idx`，界面从一开始显示。快速切换文献时旧详情不提供写入操作，关联附件使用可见条目的 ID。

## 首版界限

原文检索并非 AI 生成问答；真实模型状态明确显示未验证。译文由用户填写。已有索引、部分空白页、需要 OCR、索引截断和未解析分别显示。PDF 原生批注层未启用，复杂 Zotero 批注与迁移缺失由报告说明。

CSL JSON 只保证首版支持的书目投影，不承诺完整合集、附件、批注和 Word 引用关系迁移。本机 Zotero 必须由用户主动连接；旧版需要专用且稳定的来源名称，不同库不能沿用同一个通用名称。API 快照支持数组及 `{items, collections}` envelope，保留 snapshot 来源元信息。
