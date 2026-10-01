# Zotero 迁移兼容矩阵

核对日期：2026-09-30。下面“目标”尚须实现和实测；阶段0调查时原仓库没有已验证的 Zotero 导入器；本轮新增实现和实际能力见[本地可试用版本](local-preview.md)。本次不读取用户真实库。

## 首批入口

推荐官方 Local API v3 的只读 GET → 来源快照 → 预览 → 目标导入。用户在 Zotero 设置中开启本机应用通信；API 不可用时使用菜单导出的 CSL JSON 做书目迁移，再手动关联 PDF。API JSON 合成/文件快照用于可重复的离线验收；它不是 Zotero 菜单默认导出格式。

Zotero RDF 勾选文件/笔记为后续更完整离线入口，需专门解析器与实际导出夹具验收；首版不宣称已支持 RDF。RIS/BibTeX 可作书目交换后续补充，不作为保留全部关系的第一路线。[官方导出说明](https://www.zotero.org/support/kb/exporting)

## 按能力验收

| 内容 | API v3 目标 | CSL JSON 首批路线 | RDF 后续路线 / 首版缺口 |
| --- | --- | --- | --- |
| 文献与类型 | key/type/完整字段/raw；常用类型编辑 | 支持标准书目字段与 creators；未知字段保留 raw | 类型转换须逐项核对，不能把未知类型静默变成期刊 |
| 作者/日期/DOI等 | creator 顺序、角色、机构与原日期保留 | CSL author/editor/issued、DOI/URL及原数据 | 首版简化 authors UI 时完整 creator 仍留 raw |
| 来源 ID | 实例+库+item key；版本/fingerprint | id+用户选择的稳定 namespace；缺 id 以内容摘要标识并报警 | RDF URI/key 可否可靠还原须实测，不凭名字认库 |
| 合集及嵌套 | collection key、父键和 item 归属 | 格式不保证携带；明确缺失 | 多父关系不合法/环需报告，不能擅自扁平化丢数据 |
| 标签 | 值及类型保留；目标可先编辑值 | 格式不保证携带；明确缺失 | 色彩、快捷键等设置不属首版迁移保证 |
| 附件 | 保留子项与类型/来源声明；缺文件可见 | 不保证附件；用户关联原 PDF | 首版不自动复制本地API file://指向的文件；管理文件/链接文件后续单独验收 |
| PDF 数据库批注 | key/parent/原文/评论/页标签/raw position 保留 | 格式不含原生批注；明确缺失 | 几何类型未经验证仅报告和保留原始数据，不宣称高亮层复现 |
| 笔记 | 独立/子笔记归属，原HTML/raw保留，显示安全纯文本 | 格式不保证携带 | 富文本图片、附件内部链接与 Zotero 私有URI须单测，不伪造可用链接 |
| 同内容多附件 | 书目/附件各自身份，blob可去重 | 单纯 DOI/hash 不强制合并 | 补充材料、同一PDF归属多书目均需保持 |
| 关联、Extra、自定义字段 | raw 保留，已支持字段可映射 | 扩展字段留 raw 并报告 | 关联渲染/Extra格式解析不是全部插件数据兼容 |
| 删除/更新 | 幂等、冲突报告；不从源删除 | 重复同 namespace 输入无新增 | 不实现双向同步；来源删除不自动传播 |
| Word/LibreOffice 引用 | 不迁移已有动态引用关系 | 不迁移 | 现有写作文档继续由 Zotero 维护，书目导出不等于关系保留 |
| 插件、云权限、同步状态 | 不保证，仅保存能获得的普通字段 | 不保证 | 不迁移插件数据库、凭据或浏览器内容 |

Zotero 默认把批注存数据库，原 PDF 文件本身未必包含它们；仅复制 PDF 不能承诺迁移批注。导出“含批注 PDF”可作为独立后续输入，但会失去部分原生对象关系，须保留来源报告。[官方批注存储说明](https://www.zotero.org/support/kb/annotations_in_database)

Zotero 导出不是完整备份，重新导入也不能保证已有 Word 引用继续关联。[官方导出限制](https://www.zotero.org/support/kb/exporting)

## 本地 API 的执行边界

实现仅发 GET：/api/ 探测版本；/users/0/items 和 /users/0/collections 显式 limit/start 有界分页。首版为个人库，不猜群组身份。禁用任意远端 base URL、自动重定向和写操作；Zotero 未运行/403 时给设置提示，不绕过权限。

Zotero 10 的 Zotero-Server-ID 用于分区并回传校验；local 与 Web API 的 version 不共用。旧版没有 server ID 时需要稳定的用户来源命名，并标记身份及快照一致性降级。读取前后版本变化应中止该快照并提示重试。[官方 Local API](https://www.zotero.org/support/dev/web_api/v3/local_api)

本地 /items/<key>/file 返回 file:// 重定向，不是可以盲目下载的 HTTP PDF。首版只保存附件声明/缺失报告，手动 PDF 关联可实际使用；后续复制只接受用户预览确认过的来源文件，验证路径、符号链接、大小/hash，并始终只读源文件。[官方附件接口](https://www.zotero.org/support/dev/web_api/v3/local_api)

版本3的 items 包括子项，导入需用 parentItem 处理附件/笔记，再把 annotation 归到对应附件；collection keys 与父 collection 必须同一来源库。每类对象/字段有原始数据保留，未知结构不直接丢弃。[API 路由与分页](https://www.zotero.org/support/dev/web_api/v3/basics)、[对象数据结构](https://www.zotero.org/support/dev/web_api/v3/write_requests)、[类型和字段](https://www.zotero.org/support/dev/web_api/v3/types_and_fields)

## 预览、事务及报告

报告至少包含：
- 输入来源、源键、源版本、输入/计划 hash、批次 ID；
- 创建/更新/不变/冲突数量，合集树、标签和父子关系校验结果；
- 缺失附件、无法解析文件、未知字段/类型、未支持几何及富文本能力；
- 每条问题的机器 code、对象来源键和用户可理解说明；
- 当前能安全回滚的范围；已存在或后改对象不强行重置。

附件缺失不会伪造空 PDF；书目仍可用。HTML 显示经过转换/净化，不用 raw HTML 注入 DOM。压缩包/RDF后续输入要有路径穿越、实体扩展、大小/对象数预算；本轮不增加未经评估解析依赖。

## 开源及依赖许可

独立编写 API/导出格式适配器与直接复用 Zotero 核心是两个方案。本轮选择前者，不复制 Zotero AGPL 核心或翻译器代码；将来若复制须单独核对对应组件许可及派生作品义务。[Zotero 核心 COPYING](https://github.com/zotero/zotero/blob/main/COPYING)

RetainPDF 根[LICENSE](../../../../LICENSE)为 MIT，保留 2026 RetainPDF contributors 归属及原版权文本。不能因“先开源”直接删改原归属或未经评估把整个项目改为另一许可证。

| 已核验组成 | 当前证据 | 发行前需要做的事 |
| --- | --- | --- |
| RetainPDF | 根 LICENSE：MIT | 保留原许可/归属；新贡献许可随后明确 |
| PyMuPDF 1.26.5 / MuPDF | 桌面Python dist-info声明 AGPL-3.0 或 Artifex 商业许可 | 首要发行门槛：选择满足AGPL义务的发行结构或另行授权/替换；独立进程不自动免除义务 |
| pikepdf 7.2.0 | 已安装 METADATA：MPL-2.0 | 核对分发文件和修改范围，附对应许可 |
| httpx 0.28.1 / FastAPI 0.142.1 | METADATA：BSD-3-Clause / MIT | 分发时附归属与许可 |
| PDF.js、React、Electron、Typst、字体/VisualTeX | 项目已依赖，未完成全量发行清单 | 逐锁定版本核对；字体及第三方产物独立许可不由根 MIT 覆盖 |

PyMuPDF 许可由[官方许可说明](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright)及[1.26.5 COPYING](https://github.com/pymupdf/PyMuPDF/blob/1.26.5/COPYING)支持；最新文档版本不当作本机包版本。此表是技术发行待办，未作完整法律结论。本阶段不购买许可、不修改根许可证、不公开发行。
