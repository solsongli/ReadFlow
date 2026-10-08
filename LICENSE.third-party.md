# ReadFlow 第三方组件附录

仓库根 LICENSE 中的 RetainPDF MIT 许可保持原样。本附录不替代各组件原始许可。
固定下载 URL、版本、字节数及 SHA-256 见 `ops/models/manifest.json`。

| 组件 | 版本／来源 | 许可 | 用途 |
| --- | --- | --- | --- |
| ONNX Runtime CPU | Microsoft / PyPI，版本见清单 | MIT | 本地推理，无 CUDA |
| NumPy | 2.3.5，NumPy / PyPI | BSD-3-Clause | 数组与独立实现的检测后处理 |
| PP-DocLayout-S | PaddlePaddle 权重；oar-ocr v0.3.0 发布的 ONNX 转换 | Apache-2.0 | 23 类版面定位 |
| PP-OCRv5 mobile det / rec / 字典 | RapidAI 官方模型仓库 v3.9.2 | Apache-2.0 | 本地文字检测和识别 |
| FlatBuffers | 25.12.19，PyPI | Apache-2.0 | ONNX Runtime 依赖 |
| Protobuf | 6.33.5，PyPI | BSD-3-Clause | ONNX Runtime 依赖 |
| packaging | 25.0，PyPI | Apache-2.0 OR BSD-2-Clause | ONNX Runtime 依赖 |
| PyMuPDF / MuPDF | 1.26.5，Artifex / PyPI | **AGPL-3.0**（或 Artifex 商业许可） | PDF 解析、渲染、译文 PDF 生成 |
| pikepdf / QPDF | 7.2.0，PyPI | MPL-2.0（QPDF：Apache-2.0） | PDF 结构处理 |
| Typst | 0.15.1 | Apache-2.0 | 重排版译文 PDF 排版 |
| 思源宋体 Source Han Serif SC | Adobe | SIL OFL 1.1 | 译文字体 |

上述模型不包含 RapidOCR 或 oar-ocr 的 Python/Rust 推理封装代码。
PaddlePaddle 尚未发布 S 型的官方 ONNX 包，固定使用 oar-ocr 项目发布的转换权重，
清单保留 PaddlePaddle 原始 checkpoint 链接及发布资产 SHA-256，未使用匿名镜像。
NumPy 及部分必要的传递依赖并非 MIT/Apache，而是 BSD 许可；按其实际许可分发，不改标许可证。

打包保留 Python 发行物的 `.dist-info` 许可、ONNX Runtime 的 ThirdPartyNotices，
以及 NumPy 所带 OpenBLAS/Fortran 运行库声明（包括适用的 GCC runtime exception）。
只移除测试、头文件、训练／量化工具及 Python 推理不使用的独立 C SDK 动态库。
模型许可在 `resources/backend/models/licenses/`；其余许可在内置 Python 的 site-packages。

**关于 PyMuPDF 的 AGPL-3.0**：ReadFlow 通过 PyMuPDF 使用 MuPDF。PyMuPDF 采用 AGPL-3.0 与 Artifex 商业许可双授权，
本发行物按 AGPL-3.0 使用它。将本程序（含 PyMuPDF）提供给他人时，接收方有权依 AGPL-3.0 获得完整的对应源代码；
如需以闭源方式分发，请先取得 Artifex 的商业许可（https://artifex.com/licensing）。
PyMuPDF 源代码：https://github.com/pymupdf/PyMuPDF ；许可原文随附于内置 Python 的 `pymupdf-*.dist-info`。

