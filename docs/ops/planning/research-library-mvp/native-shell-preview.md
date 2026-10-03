# 原 RetainPDF 壳内文献管理预览

更新：2026-10-01，R9000P。当前主交付是原 Electron / React 壳内的“文献管理”页签，继续使用原导航、底部 dock 和原 PDF 阅读器。41030 的独立网页保留为历史原型，不代表用户接受的产品方向。

## 启动与使用

在 R9000P 本机执行：

```sh
cd /home/lsy/Documents/LeoProjetcs/Retainpdf/retain-pdf
python3 ops/development/native_retain_preview.py start --connector
python3 ops/development/native_retain_preview.py status
```

会打开原 Electron 窗口。当前同源入口为 http://127.0.0.1:40061/workbench.html ，仅 R9000P 本机可用。以 status 返回的实际 URL 为准；端口冲突会选择或报告可用状态，不强停其他应用。

```sh
python3 ops/development/native_retain_preview.py restart --connector
python3 ops/development/native_retain_preview.py stop
```

这是手动启动器，不设置系统自启。预览进程独立于启动终端；关闭窗口按原应用行为隐藏到托盘，stop 才显式退出。重启电脑或退出相关进程后，需要重新 start。省略 --connector 时默认不启用浏览器接收端；已有实例需要 restart 才应用选项。

使用“导入 PDF”建立文献，或先通过“Zotero / JSON 导入”预览 CSL JSON / API JSON，再关联 PDF。管理窗口可修改作者、日期、DOI、标签和合集。点“原阅读器”，选择原文后“添加批注”，再“添加笔记”；原工具菜单的“批注”可重新打开笔记。关闭阅读器返回文献管理，已保存笔记可跳回原文页，并导出 Markdown / BibTeX / CSL JSON / 原始迁移数据。

新库保存在 repo/.retain-native-preview/profile。旧 RetainPDF、Zotero 和独立原型库不自动迁移。备份应在 stop 完成后复制整个 profile，保留两个本地数据库和 PDF 文件；书目导出不是完整备份。原壳跨进程恢复已验证，整份 profile 异地恢复尚未验收。

## 实际验证

2026-10-01 恢复时，昨天登记的进程已不存活；未假定服务仍在，也未终止其他应用。原有 14 个用户改动文件 SHA256 与基线一致。

- 161 项文献库后端合成测试、43 项桌面模块测试、8 项 sidecar 测试通过。
- 3 个相关前端测试文件及完整 Web TypeScript 检查通过；原主页、详情和阅读器 JS 构建通过，缓存版本已更新。
- 原 Electron 实际 UI：昨天的文献、PDF 哈希和第 1 页批注跨进程恢复；原阅读器显示对应原文及笔记。
- 编辑中触发窗口 focus，不清掉未保存字段；外部合成 Connector HTTP 导入后，回到窗口刷新列表；也有手动“刷新”。
- 非法 PDF 被拒绝后可重试有效 PDF，同一附件不重复创建；同一 PDF 字节关联到另一文献时，原阅读器笔记保持隔离。
- 昨天已完成的实际 UI：PDF 导入、元数据/标签/合集、鼠标选文保存、返回主页、刷新后从笔记跳原文、CSL 预览/确认/重复幂等、Markdown 下载。
- 本轮通过的 UI 检查未出现 pageerror。此前验收脚本误选外层 frame / 普通 button 而超时，已改用精确文献行和 menuitem；未据此做无依据的产品修改。

本轮结果与实际截图：

- [原壳主页](validation/native-20261001-8aZ0Kx/native-home.png)
- [原阅读器及持久批注](validation/native-20261001-8aZ0Kx/native-reader.png)
- [界面验收记录](validation/native-20261001-8aZ0Kx/report.json)

## Connector：已完成的真实扩展验证

独立实现的实验性接收器位于 backend/library_mvp/connector.py，最小路径包含元数据、目标列表、PDF 二进制上传和会话更新；不接收登录 cookie 去重新下载论文。服务只绑定 loopback，默认 23119 已被其他服务占用时保留原监听者。

2026-10-01 用户授权后，使用 Zotero 官方签名 Connector 5.0.216 与 Firefox 156.0.1，在独立持久测试配置中实际点击扩展按钮，完成合成网页及用户指定的 arXiv 2503.03480v4 的元数据与 PDF 保存、同页重复点击、应用重启后从原 Electron 文献管理进入原阅读器。公开论文为 SafeVLA，共 32 页，已保留供试用。PDF 字节与源文件 SHA-256 一致。没有修改官方扩展、安装额外浏览器、登录 Zotero 账号、降低签名/证书校验或开启 WebDriver 系统访问。

这是具体扩展版本、合成页面和一个公开 arXiv 样本的部分验收。状态中的 partial_acceptance 记录已通过的范围；real_connector_verified 保守保持 false，表示完整兼容验收未完成。界面已改为显示基础保存实测范围。其他出版商网页、需要认证的 PDF、保存弹窗的合集/标签编辑以及独立 PDF 页面仍待实测。网页快照、EPUB、Word 引用和插件数据不在首版承诺内。原产品仍保留 MIT 归属，协议为独立实现。

用户现在可运行 start --connector，在另一个独立浏览器配置中使用官方 Connector 保存至“RetainPDF 文献库”，再回原壳刷新并点击“原阅读器”。用户日常浏览器未安装或改动扩展。若日常使用需要安装，用户可自行安装官方 Connector；本轮安装授权只用于独立测试配置。已有 Zotero 占用 23119 时，不能同时把默认 Connector 请求交给两个程序，不会自动停止 Zotero或修改 connector.url。

[本轮真实验收、故障原因及限制](official-connector-acceptance-20261001.md)、[扩展保存截图](validation/official-connector-20261001/official-connector-save.png)、[原壳文献管理](validation/official-connector-20261001/native-library-with-connector.png)、[原阅读器](validation/official-connector-20261001/native-reader-from-connector.png)。

协议依据：[官方 itemSaver](https://github.com/zotero/zotero-connectors/blob/master/src/common/itemSaver.js)、[官方 Connector](https://github.com/zotero/zotero-connectors/blob/master/src/common/connector.js)、[官方本机接收端](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/server/server_connector.js)。未复制 AGPL 核心。

## 关键边界与代码

- 原壳接线：frontend/desktop/main.js、src/main/local-gateway.js、research-library-runtime.js；sidecar 为 ops/development/native_library_service.py。
- 原生文献页面：frontend/web/src/features/research-library/；原 Reader 适配为 src/app/reader/adapters/native-library.ts。
- PDF / 持久化：backend/library_mvp/store.py、native_bridge.py、api.py。原 Rust 文档仍用内容 SHA；批注同时绑定文献 ID、附件 ID、SHA 和物理页码，避免相同 PDF 的不同文献互相污染。不创建假 job。
- 失败时保留已保存 PDF，原阅读器桥接可重试；事务失败可能留无引用内容 blob，不会危险删除共享 PDF。清理策略留后续处理。
- 真实 AI、费用和私有论文外传未获授权；本预览不启动模型服务。原阅读器的需要任务的翻译/AI 路线未因此自动打通。Mock 引用测试不等于真实模型质量通过；OCR 和复杂双语锚点仍未验收。
- 正式发行还需纳入 sidecar 程序资产，当前通过源码根定位运行；未打正式安装包、提交、推送或发布。保留 RetainPDF MIT 归属；PyMuPDF / MuPDF 等许可仍是发行前必须完成的核查，未擅自更换全项目许可证。
