# ReadFlow 发布约定

发布标签只使用 `readflow-vX.Y.Z`，例如 `readflow-v0.9.5`。禁止使用 `v*` 或纯数字版本标签。

ReadFlow CI 只在 `checkpoint-20261001` 分支 push、pull request 和手动触发时运行；标签不会运行 job。三个 job 分别验证 Web（Node 22、根 lockfile 的 npm ci、typecheck/build/test）、桌面测试，以及 Python 3.11 的本地文献库全部串行测试（跳过慢基准）。新提交取消同分支或 PR 的旧任务。没有 secrets、打包、Rust 编译、发布或镜像推送步骤。

安装包在获准的本机离线构建，核对 control、权限、ASAR、ELF、许可证和已有数据二次启动后，由维护者手工创建 Release、上传 deb 和校验值。创建标签本身不会发布任何内容。

## 上游工作流处置（M1）

| 文件 | 处理 | 理由 |
|---|---|---|
| desktop-frontend-sync.yml | 删除 | 引用已删除的 reader 包，旧桌面同步规则由新 CI 取代。 |
| publish-current-web.yml | 删除 | 推镜像并依赖 DockerHub secrets。 |
| release-desktop.yml | 删除 | 上游宽泛标签自动构建并发布桌面程序。 |
| release-docker.yml | 删除 | 标签发布镜像、依赖 secrets，并引用旧路径。 |
| rust-api-architecture.yml | 删除 | 依赖上游准备动作与 pipeline/devtools，本轮 CI 不管理翻译流水线。 |
| tests.yml | 删除 | 上游 Rust、翻译工具与全套服务环境不适合 ReadFlow 的轻量 CI。 |
| translate-sample-pdf.yml | 删除 | 依赖真实翻译/OCR secrets，可能调用服务。 |
| translation-offline.yml | 删除 | 属于上游 Typst/翻译流水线开发验证，本轮不维护。 |
| translation-replay.yml | 删除 | 依赖上游模型 secrets 和 promptfoo 工具。 |

本机验证不运行 npm/pip/apt 安装；使用已有依赖。GitHub Actions 的实际安装和 runner 行为仍须首次推送后验证。


## 已有数据二次启动

在仓库根运行以下检查；均只使用新建的 `readflow-*` 临时 HOME，不安装 deb，Connector 强制关闭。

```bash
python3 ops/development/check_packaged_restart.py frontend/desktop/dist-readflow/linux-unpacked
node frontend/desktop/scripts/check-existing-data.mjs frontend/desktop/dist-readflow/linux-unpacked
```

第一条使用包内 Python 与包内服务代码，预置文献、框选截图、画布图片、闪卡、OCR 目录和空凭据 agent 配置，再运行服务进程两次。第二条检查完整 Electron 工作台两次启动；需要环境允许 Chromium 沙箱及 headless Ozone。在正常桌面环境可在命令末尾加 `--headed`，仍使用隔离 HOME、禁用 GPU 和关闭 Connector。每轮 90 秒超时，退出等待也有上限。失败时不可把服务级检查当成完整桌面启动通过，应由维护者在允许的主机环境补验。脚本仅清理其专属 profile 中登记并校验了 PID 出生时间的后端进程。
