"""Gather licence notices for the Windows installer into frontend/desktop/build/windows-licenses.

    python frontend/desktop/scripts/collect-windows-licenses.py --site-packages frontend/desktop/app/backend/python/Lib/site-packages

Copies the upstream RetainPDF MIT licence, the ReadFlow component notice (including the PyMuPDF AGPL-3.0
statement), font licences and every bundled Python distribution's licence files. Electron/Chromium notices
stay next to ReadFlow.exe; model licences stay in resources/backend/models/licenses.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "frontend/desktop/build/windows-licenses"
NAMES = ("LICENSE", "LICENCE", "COPYING", "NOTICE", "AUTHORS")

README = """ReadFlow — 许可与第三方声明 / Licences and third-party notices

RetainPDF-LICENSE.txt        ReadFlow 基于 RetainPDF 开发，上游 MIT 许可原文（保持原样）。
ReadFlow-components.md       第三方组件、模型与许可附录，含 PyMuPDF（AGPL-3.0）说明。
fonts/                       思源宋体、Inter 等字体的 SIL OFL 1.1 许可。
python-packages/<名称>/       内置 Python 各发行包自带的许可文件（含 PyMuPDF 的 AGPL-3.0 原文）。
Electron / Chromium 的许可文件位于安装目录（LICENSE.electron.txt、LICENSES.chromium.html）。
文档模型的许可位于 resources/backend/models/licenses/。
"""


def copy(source: Path, target: Path) -> None:
    if not source.is_file():
        raise SystemExit(f"Missing licence source: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-packages", type=Path, required=True)
    args = parser.parse_args()
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    (OUT / "README.txt").write_text(README, encoding="utf-8")
    copy(ROOT / "LICENSE", OUT / "RetainPDF-LICENSE.txt")
    copy(ROOT / "LICENSE.third-party.md", OUT / "ReadFlow-components.md")
    copy(ROOT / "resources/fonts/LICENSE-OFL-1.1.txt", OUT / "fonts/SourceHanSerif-OFL-1.1.txt")
    inter = next(iter(sorted((ROOT / "frontend/web/src/assets/fonts/inter").glob("LICENSE*"))), None)
    if inter:
        copy(inter, OUT / "fonts/Inter-OFL-1.1.txt")
    packages = 0
    for dist in sorted(args.site_packages.glob("*.dist-info")):
        files = [p for p in dist.rglob("*") if p.is_file() and p.name.upper().startswith(NAMES)]
        for source in files:
            copy(source, OUT / "python-packages" / dist.name.removesuffix(".dist-info") / source.relative_to(dist))
        packages += bool(files)
    if not any((OUT / "python-packages").glob("pymupdf-*")):
        raise SystemExit("PyMuPDF licence files were not found; the AGPL-3.0 text must ship with the installer")
    print(f"LICENSES python_packages_with_licences={packages} out={OUT}")


if __name__ == "__main__":
    main()
