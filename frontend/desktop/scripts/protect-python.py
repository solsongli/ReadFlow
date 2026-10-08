"""Compile ReadFlow's own backend package to a native extension for protected Windows releases.

Run on the Windows build machine after prepare-app.mjs has staged app/backend:

    python frontend/desktop/scripts/protect-python.py --research-library frontend/desktop/app/backend/research-library \
        --bundled-python frontend/desktop/app/backend/python/python.exe

* library_mvp (ReadFlow's research library, translation, layout and reading code) is compiled with Nuitka
  into one library_mvp.<abi>.pyd. Every .py file of the package is removed from the staged tree.
* Data files the code locates next to itself (ocr_catalog.json, ocr_licenses/) stay in library_mvp/.
* ocr_worker.py is launched as a separate script by ocr_jobs, so a tiny launcher stub replaces it.
* native_library_service.py (the sidecar entry the desktop app launches) is compiled into the same module as
  library_mvp.native_service and replaced by a stub, so no ReadFlow service code ships as source.
* Tests are never shipped.
The upstream RetainPDF pipeline (public MIT code) is left as is.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PACKAGE = "library_mvp"
WORKER_STUB = '''"""Launcher for the compiled ReadFlow OCR worker (the implementation is in the native library_mvp module)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from library_mvp.ocr_worker import main  # noqa: E402

if __name__ == "__main__":
    main()
'''
SERVICE = "native_library_service.py"
SERVICE_STUB = '''"""Launcher for the compiled ReadFlow research-library service (implementation in library_mvp)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from library_mvp.native_service import *  # noqa: E402,F401,F403
from library_mvp.native_service import main  # noqa: E402

if __name__ == "__main__":
    main()
'''
# The source launcher locates backend/ from its own path; the stub has already put research-library on sys.path.
SERVICE_PATH_BLOCK = '''CODE_ROOT = Path(os.environ.get("RETAIN_PDF_RESEARCH_CODE_ROOT", Path(__file__).resolve().parents[2]))
BACKEND_ROOT = CODE_ROOT / "backend"
if not (BACKEND_ROOT / "library_mvp").is_dir():
    BACKEND_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_ROOT))
'''


def run(command, **kwargs):
    print("+", " ".join(str(part) for part in command), flush=True)
    subprocess.run(command, check=True, **kwargs)


def compile_package(root: Path, work: Path) -> Path:
    source = root / PACKAGE
    if not any(source.glob("*.py")):
        raise SystemExit(f"{source} has no Python modules")
    staging = work / "src"
    shutil.rmtree(staging, ignore_errors=True)
    shutil.copytree(source, staging / PACKAGE, ignore=shutil.ignore_patterns("tests", "__pycache__", "*.pyc"))
    # library_mvp is an implicit namespace package in the source tree; compile it as a regular package.
    (staging / PACKAGE / "__init__.py").touch()
    service = (root / SERVICE).read_text(encoding="utf-8")
    if SERVICE_PATH_BLOCK not in service:
        raise SystemExit(f"{SERVICE} no longer has the expected sys.path block; update protect-python.py")
    (staging / PACKAGE / "native_service.py").write_text(service.replace(SERVICE_PATH_BLOCK, ""), encoding="utf-8")
    output = work / "out"
    shutil.rmtree(output, ignore_errors=True)
    run([sys.executable, "-m", "nuitka", "--module", str(staging / PACKAGE), f"--include-package={PACKAGE}",
         f"--nofollow-import-to={PACKAGE}.tests", f"--output-dir={output}", "--remove-output",
         "--no-pyi-file", "--assume-yes-for-downloads", "--python-flag=no_docstrings",
         "--lto=no", f"--jobs={max(1, min(4, (__import__('os').cpu_count() or 2)))}"])
    built = sorted(output.glob(f"{PACKAGE}.*.pyd")) + sorted(output.glob(f"{PACKAGE}.*.so"))
    if len(built) != 1:
        raise SystemExit(f"Expected one compiled {PACKAGE} extension, found {built}")
    return built[0]


def replace_sources(root: Path, extension: Path) -> dict:
    package = root / PACKAGE
    removed = 0
    for path in sorted(package.rglob("*")):
        if path.is_dir() and path.name in ("tests", "__pycache__"):
            shutil.rmtree(path)
    for path in sorted(package.rglob("*.py")) + sorted(package.rglob("*.pyc")):
        path.unlink()
        removed += 1
    # Leave the data directory without __init__.py so the native extension wins the import.
    (package / "ocr_worker.py").write_text(WORKER_STUB, encoding="utf-8")
    (root / SERVICE).write_text(SERVICE_STUB, encoding="utf-8")
    target = root / extension.name
    shutil.copy2(extension, target)
    data = sorted(str(p.relative_to(package)) for p in package.rglob("*") if p.is_file())
    return {"extension": target.name, "bytes": target.stat().st_size, "removed_sources": removed, "data_files": data}


def verify(root: Path, bundled_python: Path) -> None:
    leftovers = [p for p in (root / PACKAGE).rglob("*.py") if p.name != "ocr_worker.py"]
    if leftovers:
        raise SystemExit(f"Source files remain in the protected package: {leftovers[:5]}")
    probe = (
        "import sys; sys.path.insert(0, r'%s');"
        "import library_mvp, library_mvp.api, library_mvp.paper_blocks_service, library_mvp.tag_catalog;"
        "import library_mvp.ocr_modules as o; from pathlib import Path;"
        "assert Path(o.__file__).with_name('ocr_catalog.json').is_file(), o.__file__;"
        "assert not str(library_mvp.__file__).endswith('__init__.py') or not Path(library_mvp.__file__).exists();"
        "import importlib.util as u; spec = u.spec_from_file_location('svc', r'%s');"
        "svc = u.module_from_spec(spec); spec.loader.exec_module(svc); assert callable(svc.create_native_app);"
        "assert 'create_native_app' not in Path(r'%s').read_text();"
        "print('protected-import-ok', library_mvp.__file__)"
    ) % (root, root / SERVICE, root / SERVICE)
    run([str(bundled_python), "-I", "-B", "-c", probe])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--research-library", type=Path, required=True)
    parser.add_argument("--bundled-python", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, default=Path("build-protect"))
    args = parser.parse_args()
    root = args.research_library.resolve()
    extension = compile_package(root, args.work_dir.resolve())
    report = replace_sources(root, extension)
    verify(root, args.bundled_python.resolve())
    import json
    print("PROTECT_PYTHON " + json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
