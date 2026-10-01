# 本地可试用版本 0.1.0

> 当前主入口已转为原 RetainPDF 壳内文献管理，见 [原壳预览与验收](native-shell-preview.md)。下文的独立网页路线属于此前原型记录。

验收日期：2026-09-30，R9000P。这是独立新增的 Web 文献库入口，使用项目内隔离 SQLite；未自动接管旧 RetainPDF/Zotero 数据库，也未集成成原桌面窗口的新主页。

## 立即打开与重启

本轮预览运行于 [http://127.0.0.1:41030/](http://127.0.0.1:41030/)，请在 R9000P 本机浏览器打开。若进程已停止，在 repo 根执行：

~~~sh
python3 ops/development/research_library.py --demo
~~~

启动器会选择现有打包 Python；前端源比产物新或没有产物时，用已有 Node 依赖构建。它不安装依赖、不启动旧库、不读取已有凭据。默认隔离目录为 repo/.research-library-preview；已有未知内容会拒绝使用。--demo 仅空库添加自写合成 PDF 和双语笔记，已有条目时不重复添加。

手动重建：python3 ops/development/research_library.py --build
换用全新隔离库：python3 ops/development/research_library.py --data-root .research-library-second --port 41031
Ctrl+C 停止服务。运行时只绑定 127.0.0.1，静态资源只开放新入口和自己的 dist/research-library，拒绝其他站点的请求。

## 已打通的使用闭环

1. 导入 PDF 自动创建文献，或通过“新建文献”建立无附件书目。
2. 编辑标题、类型、作者、日期、DOI、URL、摘要、标签和合集；支持嵌套合集与搜索。
3. “Zotero / JSON 导入”：选择官方 CSL JSON 导出或 API JSON 快照，预览来源、数量和缺口后确认；重复同来源不增项。也可由用户主动点击本机 Zotero 只读入口。
4. CSL 书目可“关联 PDF”；第一份附件立即显示。同字节 PDF 可被不同书目引用，身份不会因 hash 被合并。
5. 阅读原 PDF、翻页/缩放、选中文本，保存原文、自己的译文和评论。物理页码随笔记保存，刷新和服务重启后仍在。
6. “原文证据”用关键词检索当前文献的真实解析块。引用绑定 PDF SHA、修订、页码及块 ID，点击回原页。
7. 导出 Markdown、BibTeX、CSL JSON；“原始迁移数据 JSON”取回未投影字段、源笔记 HTML 与附件声明。

可用合成 CSL 文件：[zotero-csl-synthetic.json](examples/zotero-csl-synthetic.json)。没有真实私人数据或真实研究结论。

## 迁移能力的实际边界

| 能力 | 本版实际状态 |
| --- | --- |
| CSL JSON 书目 | 已合成与浏览器实测；合法 CSL 类型往返，作者显示为简化有序姓名，完整源数据留 raw |
| API v3 JSON | 已合成实测书目/合集/标签/笔记及父子来源关系；支持数组与 {items, collections} 快照 |
| 本机 Zotero | 官方只读 GET、限量分页与版本/实例校验有 MockTransport 验证；未访问用户真实客户端库 |
| 旧版无 server ID | 必须用户命名专用来源 namespace，避免不同库同 key 互相覆盖 |
| 附件 | 缺失声明/来源键保留；本版需手动关联 PDF，不自动读取 file://、复制源附件 |
| Zotero 原生批注 | 原文、评论、来源页标签/raw 保留；未转换为本地精确几何或可靠页锚点 |
| 富文本/插件/Word 引用 | 不保证完整迁移；HTML安全纯文本展示，原HTML留存；Word动态关系继续交原 Zotero |
| RDF/RIS/BibTeX 导入 | 未实现；BibTeX为导出路线 |
| 旧 RetainPDF 库/notes | 未自动迁移，旧应用与其数据仍独立 |

Zotero 源保持只读；导入遇到后改字段会报告冲突，不静默覆盖。批次回滚只撤销安全独占对象，后改/被引用对象会拒绝；源删除不自动传播。缺失/未知字段在预览报告内可见。

## AI 验证状态

原文证据检索已实测；它是本地关键词检索，不是模型综合问答。默认真实 AI 路由返回 AI_MODEL_NOT_AUTHORIZED。

只读检查发现现有 41100 健康接口在线；未读取模型凭据/秘密配置，未调用模型。没有发现已运行的 Ollama 本地模型端点。AI 回答→引用校验采用注入 mock 做接口测试：无依据、伪造 ref、跨论文、修订/文件 hash 不符均被拒绝；这不代表真实模型质量验证通过。

下一步要做真实 AI：需指定允许调用的模型/接口，确定合成摘录是否可外传、费用上限，并适配隔离文献上下文。真实私人论文外传及付费 API 未获本次授权；现有凭据不得回显或直接读取。模型状态和费用未知时不自动重试或启用问答。

## 本次实际验收

- 新后端完整合成 unittest：84 项通过（Store 21、API 8、Zotero 38、Evidence 11、Launcher 6）。
- 新前端局部用例：14 项通过；独立严格 TypeScript 检查通过；构建通过。
- 系统 Chromium 154.0.8037.57：14 项端到端检查通过。包括真实画布/text layer、选文存页码双语笔记、元数据/分类、CSL预览与幂等、首次关联、证据跳页、两类数据导出、刷新/重启、停服复制异地恢复和无未处理脚本异常。
- 阶段0原已有基线：7 个前端测试文件、8 个 Linux 运行时 subtest、9 个 AI 零参数断言通过。
- 原 14 个用户 Linux 改动的字节 hash 全部不变；没有提交/推送、依赖安装、公开发布或真实库读取。
- 完整 Rust workspace、原桌面全流程、真实 Zotero 客户端、OCR 和真实模型质量未验收。

本轮独立审查发现并修复四项：旧版来源覆盖、切换文献时误关联窗口、CSL类型漂移、API快照对象形状不一致；修复后重新测试。[详细基线](acceptance-and-baseline.md)

## 复现验证

在 repo 根，使用现有打包 Python：

~~~sh
frontend/desktop/linux/linux-unpacked/resources/backend/python/bin/python3 -B -m unittest discover -s backend/library_mvp/tests
node frontend/web/node_modules/typescript/bin/tsc --noEmit -p frontend/web/src/app/research-library/tsconfig.json
node frontend/web/scripts/research-library-smoke.mjs
~~~

前端用例在 frontend/web 下：

~~~sh
node --import ./tests/helpers/register-jsx.mjs tests/research-library/model.test.mjs
node --import ./tests/helpers/register-jsx.mjs tests/research-library/api.test.mjs
~~~

受限执行沙箱会阻止部分 AnyIO/socket/ELF 操作；本轮在已授权的本机执行范围运行后通过。端到端脚本自行建 /tmp 新库、新端口和临时 Chrome profile，始终不连接用户真实 Zotero。它使用现有 /usr/bin/google-chrome，可通过 RESEARCH_CHROME_EXECUTABLE 指定已有浏览器；不下载浏览器。

## 备份与恢复

停止服务后，把整个 .research-library-preview 复制到不存在的新目录，包含 library.sqlite3、blobs、两份目录标记和导入记录。不要只拷贝一份运行中的 SQLite 文件；Markdown/CSL 导出也不是全库备份。

恢复时用 --data-root 指向这份完整副本并换端口。合成实测把停服目录复制到另一根后，文献/来源键/笔记保留，原 PDF 字节完全一致。恢复应先在副本中核对条目数、关键笔记和 PDF hash，不覆盖旧目录。在线快照备份 UI、旧库迁移和跨设备同步仍未实现。

## 下一改造切片

先试用此入口并记录真实操作缺口；随后在合成样本下把 item/attachment/source-link/annotation 契约增量融入 retain-db，再做已授权来源附件复制和原生批注坐标转换。跨论文比较放在单篇真实 AI 引用可靠之后。

发行前继续处理[许可证清单](zotero-migration.md)：保留 RetainPDF MIT 归属，评估 PyMuPDF/MuPDF 的 AGPL/商业许可及其余依赖、字体。当前代码未修改根许可证，也未公开发行。
