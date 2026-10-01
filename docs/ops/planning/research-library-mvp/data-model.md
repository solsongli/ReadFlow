# 数据关系与模块边界

以下是目标关系和首版约束，不是对现有 schema 的说明。实现差异须在检查点记录。

## 身份与归属

| 实体 | 身份、关系和关键字段 |
| --- | --- |
| PaperItem | 稳定 UUID；书目类型、标题、creator 角色/顺序、完整日期、DOI/URL/期刊等；可以没有 PDF；保留原始来源字段 |
| Attachment | 独立 UUID，属于 PaperItem；文件 SHA-256、文件名、MIME、大小、页数；指向不可变受管理 blob；来源附件键与可用/缺失状态 |
| ParseRevision | 独立修订 ID，属于附件及确定的输入文件哈希；解析器/版本/配置哈希、document.v1 schema、产物哈希、质量状态、历史 job/attempt/generation 引用 |
| Annotation/Note | UUID，属于 PaperItem；附件和修订可空；原文 quote、translated_quote、评论分别保存；物理 page_idx 为 0-based，page_label 另存；来源类型/几何/raw/source_key |
| Citation/Evidence | 引用快照绑定 item、attachment、文件 SHA、parse_revision、page_idx、block_id、原文及其哈希；可选 bbox、原文页标签；模型/译文不能代替原文 |
| Collection/Tag | 合集树和 item 多对多；保留来源合集键、父键和标签 manual/automatic 信息，UI 可仅先显示简化值 |
| SourceLink | source_kind + source_instance + library_scope + source_object_key 唯一映射本地实体；来源版本、原始数据及 fingerprint |
| ImportBatch | 输入/计划哈希、状态、各对象增改清单、冲突、缺失及转换报告；记录批次所有权，供幂等、恢复与安全回滚 |

PDF 字节相同不代表是同一条书目；同一条书目也可以有出版版、预印本或补充材料。DOI 用于候选匹配和人工判断，不做强制全局唯一键。blob 可以去重，item 身份不能由文件哈希替代。

## 兼容现有哈希 ID

现有[模型](../../../../backend/packages/retain-core/src/models/library.rs)第 7 行将 document_id 定为 PDF 字节 SHA-256；[上传准备](../../../../backend/api/src/services/uploads/staging.rs)第 64 行在校验/修复前计算输入哈希，[发布事务](../../../../database/retain-db/src/db/uploads.rs)第 44 行一起保存 upload 和 document。

增量方案保留 documents、uploads、jobs 及既有 API，不重写旧 ID。新 attachment 可保留 legacy_document_id；一个已有 document 可首次投影为一个默认 item/主附件，再由用户拆分或关联。历史关联应标记 legacy，不凭 DOI 自动合并。新 item 合集/标签为自己的真值，旧 document 投影只反映约定的主附件，不能给共享 PDF 的所有书目强行传播标签。

现有[版本迁移](../../../../database/retain-db/src/db/schema.rs)第 198 行已有 document_versions，属于 AI 文档操作的派生 PDF；第 240 行起有 pipeline_attempts、generation。ParseRevision 表达文本/块空间修订，不能把 document_versions 或 job_id 当同一种版本。优先引用已有管线身份，不重复创建另一套管线状态机；发布解析修订须固定产物快照，不能假定相同 job 的重跑文件不可变。

上传修复[代码](../../../../backend/api/src/services/uploads/pdf.rs)第 30 行会替换上传路径，而原哈希早于修复。新入口保留原始字节，修复输出另作派生附件/版本并记录两个哈希；不把修复后字节声称为原始 hash。

## 解析、批注和引用

先做文本 PDF 原生提取并按 document.v1 归一化；只有缺少文本或质量不足的页进入明确 OCR 流程。local_command 是外部命令接口，不意味着已安装可用 OCR。列顺序、公式、表格和跨页段落须有固定样本；错误时保留源 PDF 阅读，不用损坏解析支撑 AI。

坐标目标约定：未旋转 CropBox 内左上原点的归一化坐标，保存原始来源位置和转换器版本。PDF.js viewport、旋转、CropBox 与 Zotero position 的实际转换须逐类型实测；未验证的几何标成未解析，不能声称已经可精确跳转。0-based page_idx 与 UI 物理第 N 页只在边界换算，原印刷页标签单列。

现有 ReaderNote 只有页/quote/note；[类型和存储键](../../../../frontend/packages/reader/src/annotations/types.ts)第 20、35 行显示 job 优先，[存储](../../../../frontend/packages/reader/src/annotations/storage.ts)第 33 行为 localStorage。新笔记以服务器 SQLite 为持久真值，先提供显式旧笔记导出/预览再迁移，不从浏览器私下扫描旧数据。第一次同步失败保留旧副本和导入报告；不先删 localStorage。

现有 favorites 已有 quote、译文、asset/rect，且[迁移](../../../../database/retain-db/src/db/schema.rs)第 119 行保护 job 外键。新批注不能先消除这一保护。新 AI 引用应保存原文完整快照和修订身份；修订/附件不存在时仍可显示摘录，并明确“源文件不可用”，不要静默跳到新的 active_job。

[引用代码](../../../../backend/ai/retainpdf_ai/agent_evidence.py)第 407 行对没有标记的回答会回退列出检索页；这不是逐条结论被原文支持的证明。首版区分“已引用依据”和“检索到的候选”，每条声明用实际 block 原文核对；伪造 ref、跨文献、失效修订、超页码均拒绝。尚未真实调用模型时只展示“原文证据检索”。

## 模块边界与持久化顺序

- Import adapter：只读来源/格式解码 → canonical ImportPlan + raw + 问题报告，不决定用户数据覆盖。
- Library domain：书目/合集/标签/来源关联和事务提交；元数据冲突的人工确认归此层。
- Blob store：受管理原始文件、哈希验证、相对路径、临时 staging 和垃圾回收；不修改来源。
- Parsing：附件输入 → 不可变解析修订，原文/译文分离。
- Reader adapter：沿用独立 Reader 的公开 exports 和宿主能力；本地首版可先使用同一 react-pdf/PDF.js。
- Evidence/AI：限定 item/attachment/revision 的检索、可信原文 ref、模型费用边界；不直读任意文件路径。
- Export/backup：笔记/书目导出与完整文件备份分别表达，不把文献格式导出当成备份。

首个 Python 适配层使用全新库来验证上述业务行为；不能直接共享并迁移原 jobs.db。后续经合成迁移/回滚测试，将新表追加到 retain-db 的版本阶梯，[已有迁移规则](../../../../database/retain-db/src/db/schema.rs)第 4 行要求追加版本，不能重写历史迁移。

## 提交、幂等与回滚

预览包括来源实例、对象键、数量、可迁移字段、缺失附件、不可渲染批注、冲突和资源预算。先复制文件到目标 staging，验证大小/hash，再一次数据库事务发表可见记录；大库若分批须报告批次边界，不能宣传全库原子性。文件移入后数据库失败产生的孤儿由本批次清单回收，不删除先前或共享文件。

相同来源键/同 fingerprint 重复导入为 unchanged；来源变更只修改未被用户修改的字段，否则产生冲突并保留用户值。来源删除不自动删除目标。没有稳定实例身份的文件导出必须选择/记录同一 source namespace；不要用不同 API 的版本号互相比较。

回滚只撤销本批新建且仍未被后续编辑/引用的实体。对已有实体的修改需前值和版本比较；无法证明可恢复时返回冲突，不能直接重置用户改动。共享 blob、后加笔记和其他批次导入的对象不可被回滚误删。保留批次报告，回滚不是无条件删除所有目标数据。
