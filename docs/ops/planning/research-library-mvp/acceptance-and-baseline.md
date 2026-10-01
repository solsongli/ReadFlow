# 合成验收、现有测试基线与恢复

日期：2026-09-30。测试只用项目源码和 /tmp 合成夹具，未启动旧应用、读取真实文献库或调用付费模型。以下先记录阶段0实际检查，后续实施结果追加独立检查点。

## 工作区保护

仓库 main 起始 HEAD 857868407aeace94ccf5d8cf0bcf90aecae3b7bf；原有 11 个 tracked 修改、3 个 untracked 文件的 status/字节 SHA-256 已记录在[基线 JSON](workspace-baseline.json)。它仅含源码路径与摘要，不含秘密。Linux变化主要是 ELF/RPATH/GLIBC 校验、运行时裁剪和 desktop setup 空按钮防护。

本轮不得 reset/clean/stash/提交/推送，也不能覆盖这些用户改动。每个检查点重新计算14个文件 hash，确认不变。新的实现使用独立路径，已有同名文件先读；创建基线文档采用独占创建。未发现适用项目 AGENTS.md 或 .agents/skills，打包第三方 FastAPI 内的 .agents 不作为本项目指令。

## 已执行的离线检查

| 检查 | 实际结果 | 范围限制 |
| --- | --- | --- |
| Reader/文献列表/desktop gate Node | 7 个测试文件通过，exit 0 | TAP 按文件汇总，不能当成所有内部断言数；没有执行全部前端套件/视觉验收 |
| Linux运行时/裁剪 Node | 8 个独立 subtest 通过、0 skipped，exit 0 | 受限沙箱首次4个ELF断言被 readelf EPERM阻断；获准后在沙箱外仅运行现有/tmp夹具，全部通过 |
| AI引用回退与文档隔离 | 9 个零参数 test 函数直接执行通过 | 使用bundled Python -I -B/runpy，非完整pytest；MockTransport无外网；不证明真实模型质量 |
| Rust workspace / 完整翻译流水线 | 未运行 | 没有可用Cargo；bundled Python无pytest，系统环境缺部分Python依赖，不随意安装 |
| 桌面全流程/OCR/真实AI | 未运行 | 本次阶段0不启动旧数据环境、不产生模型费用 |

复现Node命令（repo 根）：

~~~sh
node --test frontend/desktop/scripts/linux-runtime.test.mjs frontend/desktop/scripts/runtime-prune.test.mjs
~~~

前端检查（frontend/web 目录）：

~~~sh
node --import ./tests/helpers/register-jsx.mjs --test tests/reader/reader-notes.test.mjs tests/reader/reader-annotations-vm.test.mjs tests/reader/server-favorites.test.mjs tests/reader/citation-fallback-boundaries.test.mjs tests/reader/citation-injection-boundaries.test.mjs tests/library/documents-library-source.test.mjs tests/credentials/desktop-setup-gate.test.mjs
~~~

Python实际用 frontend/desktop/linux/linux-unpacked/resources/backend/python/bin/python3 -I -B，以 backend/ai 为显式 sys.path，runpy 加载 tests/test_citation_fallback_boundaries.py（6条）及 tests/test_scope_isolation.py（3条），直接执行零参数 test 函数。没有生成 pycache 或pytest cache。

现有环境：Node v22.22.3；bundled Python 3.11；FastAPI、uvicorn、httpx、PyMuPDF 可用，pytest/python-multipart 不可用。上传可使用原始 PDF body，避免为可用版本安装依赖。现有 esbuild/React/react-pdf/Playwright 可利用；浏览器能否启动另行实测。Cargo 与构建 Rust 所需工具链是后续融合缺口。

## 新版合成样本计划

所有测试样本使用自写文字/生成PDF和虚构来源 key，不引用真实用户数据。fixture 记录生成方法、schema、来源文档版本、预期数量；不复制 Zotero 核心或私人库。

| 组 | 样本与验收 |
| --- | --- |
| 书目 | 中英标题、机构作者、多人作者/编辑、日期、DOI/URL、缺标题、未知类型/字段；raw不丢、显示不乱码 |
| 关系 | 两层合集、多合集归属、手动/自动标签；缺父/循环/跨库key产生问题，不静默丢关系 |
| 身份 | 同DOI不同记录、相同PDF多书目、单书目多PDF；只blob去重，二次同source导入无新增 |
| 文件 | 2页文本PDF、空白/扫描页、损坏/加密/超预算文件；源字节hash保持，错误可见，失败不留可见半条目 |
| 笔记 | 普通/子笔记、中文双语摘录、带原始HTML/恶意标签、未知几何；安全显示、页码可跳转、刷新/重启持久 |
| 引用 | 第一页/最后页、不同解析修订、伪ref、跨附件/跨论文、无文本；可信引用必须回到同一SHA/修订/物理页 |
| 导入事务 | 中途失败、重复commit、数据后改、两个批次共享blob、回滚；不能误删已有/后改/共享数据 |
| Local API | MockTransport分页、403、超时、重定向、serverID改变、版本变化；只GET、无真实Zotero请求 |
| 导出恢复 | Markdown中文/换行、BibTeX转义、CSL字段；停服务复制新库+原PDF至全新位置恢复，哈希/条数/笔记一致 |
| UI闭环 | 浏览器生成空库→导入→改元数据/合集→PDF渲染→保存双语笔记→证据点击跳页→导出→重载；console无未处理错误 |

复用原引用隔离测试之外，还须让新版的合成页面结果、跳页和文件 SHA 对得上；只看接口200不足以验收阅读器。真实 AI 验证单列，mock通过或本地证据检索不能替代。

## 备份和恢复边界

旧系统[架构](../../../../docs/core/backend/ARCHITECTURE.md)第 87 行起的数据根包含 db/jobs.db、jobs、uploads、downloads及SQLite外凭据。只复制数据库会遗漏论文/解析产物；只导出Markdown/CSL又会遗漏本地身份、批次和笔记。这里仅记录范围，阶段0不读取或拷贝其中的秘密。

新适配层的隔离根应包含新SQLite、受管理原始PDF及必要解析/导入记录。首版提供明确停止服务后的目录备份与恢复步骤；热复制 WAL 数据库不当作一致备份。后续在线备份用 SQLite backup API/冻结写入，并附blob清单/哈希及schema版本；恢复到新目录验证，不覆盖旧库。

localStorage 旧笔记在旧数据库之外，必须通过阅读器显式导出或经授权迁移；备份jobs.db不能声称涵盖它。操作系统密钥/凭据单独设计可移植恢复，不能把凭据加入公开样本或诊断报告。未来恢复和rollback仍需留足磁盘空间，不把“迁移完成”当作可删除原库的依据。

## 运行与验收检查点

本轮会在新入口和隔离目录启动首版，不运行现有 dev_stack 的默认安装/编译路径。原开发命令参考[CONTRIBUTING](../../../../CONTRIBUTING.md)；其默认会准备依赖并构建，不作为本次无需安装的启动承诺。

完成时记录：新修改文件列表、14个旧文件hash复核、实际启动命令和URL、后端/浏览器测试数、所有未支持迁移字段、真实模型验证状态、剩余风险。普通可逆代码可持续推进；付费模型、外传真实论文、依赖安装、提交/推送/公开发布须走当前父线程边界。
