# 官方 Zotero Connector：原 RetainPDF 壳内真实验收

日期：2026-10-01，R9000P。本记录覆盖真实浏览器扩展操作，不以模拟 HTTP 代替扩展保存。09-30 的暂停已被 10-01 的继续与安装/测试授权覆盖；旧暂停检查点仅作历史记录。

## 实测环境与结果

- Firefox 156.0.1；Zotero Connector 5.0.216，扩展 ID zotero@chnm.gmu.edu。官方未修改签名 XPI 的 SHA-256：f323a1da3a09bb00d1fdc9bb33dede6ec56f669524a6739bad6f1f484c7086e1。
- 下载来源：[Zotero 官方 Firefox 分发文件](https://download.zotero.org/connector/firefox/release/Zotero_Connector-5.0.216.xpi)。保留签名和证书校验，未开启 allow-system-access。
- 06:01:59 UTC：实际点击 Firefox 扩展菜单按钮，通过 Embedded Metadata 识别合成论文，保存标题、两位作者、日期、DOI 和两页 PDF。弹窗显示真实目标“RetainPDF 文献库”，PDF 无失败标记。
- 入库文献 ID：80db0c36-421d-4fda-b143-e7ffdd0b1f3d；附件 ID：d0fe3ce8-2792-41b2-8dfd-7cc34c4ab5ff。源 PDF 和从应用附件接口读回的 SHA-256 均为 37b15d43e7d34cabf3a61f78176941a83bb426f0f1fb09270aee38cfb620c355，2617 字节、2 页。
- 06:03:59 UTC：同页再点击保存两次，文献数量和附件 ID 未改变。换 URL 创建的新保存会话仍是独立条目；不按 DOI 自动合并或承诺跨所有会话去重。
- 06:06:23 UTC：重启原 Electron 应用后，文献/附件仍在；从原导航的“文献管理”点击“原阅读器”，显示对应 PDF 及“sample accuracy is 73.5 percent”合成原文。无页面运行时错误。
- 实测使用原 RetainPDF 40061 同源入口，未以 41030 历史独立界面代替。

机器可读证据：[真实扩展保存及重复保存](validation/official-connector-20261001/real-connector-acceptance.json)、[原壳阅读器验收](validation/official-connector-20261001/native-reader-report.json)。

## 实际发现与修正

1. 初次由 geckodriver 自动创建的临时配置，会在 DELETE WebDriver session 时自动删除。先前“配置保留”记录不准确。获得恢复授权后，用已下载的相同签名 XPI 恢复到 connector-test-20261001-0t7i3ezy/persistent-firefox-profile；显式 --profile 原地使用，已验证一次关闭会话后扩展仍存在。没有读取日常浏览器资料。
2. Ctrl+Shift+S 被本机 Firefox 截图功能占用。改为真实扩展菜单按钮，并按属于测试 Firefox PID 的弹窗坐标点击，避免硬编码位置漂移。没有直接调用扩展内部保存函数。
3. 首次附件失败来自测试夹具：citation_pdf_url 的 HTML 属性缺少开头引号，地址末尾因此多出双引号。扩展日志显示 GET paper.pdf%22 返回 404，没有向本地接收器上传 PDF。修复夹具生成器及现有合成 HTML，增加 HTMLParser 和浏览器 DOM 的 URL 断言后，真实 PDF 上传通过。未为这一夹具错误改动应用上传协议。
4. 404 情形中元数据已保存，扩展明确标红 PDF。两个失败场景的元数据记录仍保留，不能误认为重复点击造成的重复条目。
5. 官方扩展日志只在本地查看，未提交至 Zotero；合成阶段未使用真实论文、账号、Cookie 或模型；后续仅按用户指示下载并本地验证下述公开 arXiv 论文。曾有一项只读执行的自动审批超时，按工具允许重试一次后成功，没有追加权限需求。

## 本轮代码与回归

仅新增实测范围记录与界面文案：backend/library_mvp/connector.py、frontend/web/src/platform/contracts/research-library.ts、frontend/web/src/features/research-library/ui/ResearchLibraryView.tsx，及其正常生成的 Web 构建文件。接收、持久化、鉴权和上传逻辑未因测试夹具错误改变。

回归结果写入本目录的 connector-handoff-checkpoint-20261001.json；本轮运行文献库后端合成测试、native sidecar 测试、3 个相关前端文件和 Web TypeScript 检查，并构建原 Web 入口。先前 43 项桌面测试结果仍见 native-shell-preview.md，不能把它们误记为本轮重复运行。

## 边界和继续方向

- 已验证 Connector 5.0.216 / Firefox 156.0.1、一个合成 Embedded Metadata 页面，以及用户指定的 arXiv 2503.03480v4。其他出版商网站、登录后附件、其他浏览器版本、扩展保存弹窗的合集/标签修改和独立 PDF 页面尚未实测。
- partial_acceptance 提供这一范围；real_connector_verified 仍为 false，完整兼容性未作承诺。所有支持状态继续标记实验性。
- 网页快照、EPUB、Word 引用关系、Zotero 插件私有数据不在已验证范围。真实 AI 未调用；不能从此次附件测试推出 AI 引用质量通过。
- 日常浏览器未修改。独立测试配置和夹具保留于 repo/connector-test-20261001-0t7i3ezy，目录内容被其自身 .gitignore 忽略。原应用的演示库继续位于 .retain-native-preview/profile，未迁移私人库。
- 后续优先验官方弹窗合集/标签更新及少量用户授权的真实公开站点，然后明确包装/备份恢复/许可事项。无须为已经通过的基础路径重复安装扩展。

## 试用

在本机 repo 中执行：

```sh
python3 ops/development/native_retain_preview.py start --connector
python3 ops/development/native_retain_preview.py status
```

原壳入口：http://127.0.0.1:40061/index.html?tab=research 。搜索 SafeVLA 并点击“原阅读器”；公开论文已保留在试用库中。如已有实例配置不一致，使用 restart --connector。不会配置系统自启；关闭窗口按原程序行为隐藏到托盘，stop 显式退出。23119 被其他程序占用时保留已有程序，不能抢占。


## 用户指定的公开 arXiv 论文

用户指定 [arXiv 2503.03480](https://arxiv.org/abs/2503.03480) 后，继续使用同一官方扩展和独立浏览器配置；没有重装或重新下载扩展。

- 06:20 UTC：在真实 arXiv 页面实际点击扩展按钮，保存 SafeVLA: Towards Safety Alignment of Vision-Language-Action Model via Constrained Learning。8 位作者、DOI 10.48550/arXiv.2503.03480、两项学科标签、论文摘要及官方 translator 的 comment 来源笔记均进入本地库。
- 文献日期 2026-04-19 是本次 v4 修订日期；首次提交为 2025-03-05。没有把版本日期解释为首次发表日期。
- 扩展上传的 PDF 共 32 页、16,355,430 字节。应用附件读回值及浏览器另取官方 /pdf/2503.03480v4 的 SHA-256 完全一致：91d8a7eeadc5841ef2328c242e9eb1197eecd9ab769c94c4bd9e2eaceaa68d13。PyMuPDF 打开时无需修复，首尾页可读，首页有 v4 标记。
- 06:22 UTC：同页再点击两次，仍只有 1 个 SafeVLA 条目，附件 ID 未变。这不代表不同会话或不同 URL 会自动合并。
- 06:30 UTC：重启原 Electron 应用后，从原“文献管理”搜索并点击“原阅读器”，显示这份 PDF 的首页、标题和 1 / 32 页码，页面运行时错误为空。文献与附件 ID、SHA 均不变。
- 重启后 native_bridge 的验证缓存变为 unverified 属于既有设计；正常“原阅读器”按钮会先重验源文件再导航。首次新增验收脚本错误地要求重启前后的进程缓存恒为 ready，修正为验证正常 UI 路径后通过；没有为此修改应用持久化逻辑。
- 文献 ID：626f17cb-6f21-4e57-ad2d-ff54d6387e89；附件 ID：b9bf0f8d-ae33-405a-9dff-ca4295be9ccd。该公开论文保留供用户本地试用。没有向外部模型上传论文或调用收费 AI。

证据：[元数据与重复保存](validation/arxiv-2503.03480-20261001/arxiv-acceptance.json)、[独立官方 PDF 哈希](validation/arxiv-2503.03480-20261001/arxiv-source-verification.json)、[文件完整性](validation/arxiv-2503.03480-20261001/arxiv-pdf-integrity.json)、[重启后原壳阅读](validation/arxiv-2503.03480-20261001/native-reader-report.json)。同目录保存实际官方扩展、原壳列表和原阅读器截图。public_samples 仅记录这个实测样本，不代表所有 arXiv 页面或出版商网站均兼容。
