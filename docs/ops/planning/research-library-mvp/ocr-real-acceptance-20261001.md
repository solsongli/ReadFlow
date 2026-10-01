# 原壳本地 OCR 实测交付（2026-10-01）

本记录更新同日 07:33 的实施检查点：OCR 已经真实下载、安装、识别、卸载恢复及重启验收；AI 真实模型调用仍未验收。

## 入口与使用

在 R9000P 本机打开 `http://127.0.0.1:40061/index.html?tab=research`。沿用 RetainPDF 原 Electron/React 界面和原阅读器。

1. 导入 PDF，勾选文献，打开“文献库工作区”。
2. “可选 OCR”中点击“检查文字层并按需 OCR”；可查看进度、取消、重试。
3. 完成后在“原文检索 / Agent”输入关键词，点击“本地原文检索”。引用可返回原阅读器对应物理页。

正常启动或重启（仓库根目录）：

```sh
python3 ops/development/native_retain_preview.py start --connector --allow-ocr-download
python3 ops/development/native_retain_preview.py restart --connector --allow-ocr-download
python3 ops/development/native_retain_preview.py status
```

OCR 模块已保留为就绪状态；不需要用户重复安装。关闭窗口会隐藏至原托盘，`stop` 显式停止本预览；未设置系统自启。

## 真实验证结果

| 检查 | 结果及证据 |
| --- | --- |
| 原壳安装生命周期 | 从原壳“查看下载清单→确认下载”触发，真实下载、校验、解包、自检、进入就绪；共18个固定文件，151,802,982字节（144.8 MiB） |
| 完整性与版本 | 18文件大小/SHA-256及解包后文件校验通过；15个新增Python发行包的实际版本与清单逐项相同 |
| CPU识别 | RapidOCR 3.9.2、ONNX Runtime 1.30.0、PP-OCRv5 mobile 检测/识别与PP-OCRv4分类；不安装GPU驱动 |
| 文字层优先 | 合成PDF第1页保留原文字层，来源标记为`native`；第2、3页真实本地识别，来源为`ocr` |
| 中英文 | 第2页准确识别“Local citation evidence on page two.”及“本地文献证据测试” |
| 旋转与坐标 | 第3页90°旋转源PDF不改动；识别到“扫描页引用与页码”，输出未旋转PDF坐标，所有bbox在页范围内 |
| 取消、重试 | 原壳取消实际运行的任务，停在1/3页；原壳重试继续完成3页，识别两张扫描页约2.5秒（本机、清晰合成样本） |
| 缓存 | 再次运行返回`cached=true`，复用相同解析修订 |
| 引用 | 本地检索中文OCR原文，引用包含源SHA、解析修订、物理页码与bbox；实际打开原阅读器第2页 |
| 卸载 | 原壳移除模块后，模块运行目录和其下载缓存被清理；文献、笔记、PDF SHA、OCR解析及原文检索均保留 |
| 恢复、重启 | 使用本任务已校验的恢复文件，经原壳重新安装成功；重启后模块就绪、笔记和OCR文本保留 |
| 遥测关闭 | 在导入ONNX Runtime前设置`ORT_DISABLE_TELEMETRY=1`，随后调用关闭API；安装自检也设置同一环境。最终真实识别在受限沙箱通过，未需要网络，stderr为空 |

实际源PDF：3页，12,028,276字节，SHA-256 `9825372570fe65f079e926f5b8c671089e296f087e2effc38ca0c2b7bab35b65`。源内容全为本任务生成的测试文字，没有私人论文。文献ID `0249cddc-8225-42cf-85a3-5a14eb3c5732`，附件ID `cdda645b-d348-4009-9ca7-84d596c3722a`。

证据在 `validation/ocr-agent-20261001/`：

- `real-ocr-install-*.json`：保留失败及成功安装记录，未将失败算通过。
- `real-ocr-acceptance.json`：真实识别、取消、重试、缓存、引用、坐标及源哈希检查。
- `real-ocr-uninstall.json`：卸载保留文献、笔记和解析。
- `real-ocr-final-restart.json`：恢复后重启和原壳状态检查。
- `real-ocr-telemetry-disabled.json`：最终受限沙箱真实识别。
- `real-ocr-final-ready.png`、`real-ocr-citation-original-reader.png`：实际界面截图。

## 实测发现并修复的问题

- 官方文件站出现间歇性TLS提前断连。增加同一HTTPS会话复用、最多三次连接重试和已验证文件缓存；保留原批准URL、字节数、SHA及TLS证书验证，不更改系统代理或网络安全设置。重试不丢弃已校验文件。
- ANTLR官方源码包包含纯声明的egg-info。仅允许已知五种元数据文件，继续禁止执行`setup.py`、脚本和路径穿越。官方sdist未附完整许可证，已从其固定4.9.3上游标签补齐；未增加其他运行包。
- 下载会话禁止自动读取无关netrc凭据，也不向重定向目标转发Authorization。
- OCR完成后附件快照仍显示`not_parsed`，现依据完成作业显示中文状态。
- ONNX Runtime 1.30的POSIX SDK默认会初始化遥测；最终版本在导入前关闭。首次诊断出现过设备ID初始化提示，先前测试未做网络抓包，因此不把早期运行宣称为“所有SDK网络行为均已验证关闭”。本次全部识别材料均为合成资料。依据：[官方遥测环境开关](https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/onnxruntime/core/platform/telemetry_environment.h)。

## 安装范围与许可

独立目录：`.retain-native-preview/profile/chromium/data/research-library/optional-ocr/`。运行目录逻辑大小476,497,312字节，约454.4 MiB（包含原下载档案，缓存采用硬链接避免重复存储）。15个Python包和3个模型已固定于 `backend/library_mvp/ocr_catalog.json`，复用原有Python3.11、Pillow10.4.0、requests2.32.5。

保留21个许可/归属文件，包括从[ANTLR官方4.9.3许可证](https://raw.githubusercontent.com/antlr/antlr4/4.9.3/LICENSE.txt)补齐的文本。恢复硬链接位于 `.retain-native-preview/ocr-acceptance-recovery-20261001/`，只属于本轮测试；没有删除测试资料。

未修改系统Python、显卡驱动、浏览器权限、原凭据或项目总许可证。RetainPDF原MIT归属保留；既有PyMuPDF许可及将来公开分发的完整依赖审计仍需独立处理。

## 回归与当前限制

- 文献库/OCR/Agent及sidecar合计 **205项通过**；最终遥测补丁之后相关 **18项OCR回归通过**。
- 前端 **27项测试通过**，TypeScript与构建通过。构建仍有原有CSS选择器及bundle大小警告，未阻止构建。
- 真实原壳检查无JavaScript异常。没有提交、推送或公开发布。
- 这不是扫描科研论文质量基准：未验证复杂多栏、公式、表格、手写、低清晰度或严重倾斜。当前按“页面无文字”启动OCR；含少量页码/水印文字的混合扫描页是后续需要增强的场景。
- OCR结果不会写回原PDF或自动生成PDF隐藏文字层；文本、bbox与修订保存在文献库中，原阅读器显示原文件。

## AI自由配置的准确状态

原壳“文献库专用模型设置”支持自定义OpenAI-compatible Chat Completions地址、模型名和API Key；HTTP仅允许本机回环，远程用HTTPS；本地无认证服务可留空密钥。模型需支持function/tool calling，不支持时明确提示，仍可本地原文检索。不是所有任意协议模型无需适配。

本次没有真实模型调用，也没有读取已有密钥。对11434、1234、41100、41160的非敏感只读探测未找到响应；这不证明所有可能端口均无模型。

当前运行的真实模型调用开关仍关闭。用户自行选定服务并决定调用后，可重启时增加`--allow-external-models`，随后在界面保存配置、点击“Agent问答”；该操作会向其所选地址发送选中文献的原文片段，费用取决于服务商。配置或打开工作区不会自动调用模型。当前不能将本地原文检索或离线模拟结果称作真实Agent回答验收。
