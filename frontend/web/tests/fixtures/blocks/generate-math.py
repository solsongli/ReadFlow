"""Generate the owned X2c mathematical fixture with the already bundled renderer/fonts."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root.parents[4]))
from backend.library_mvp.paper_blocks_render import runtime_paths

binary, fonts, packages = runtime_paths()
command = [binary, "compile", "--root", str(root), "--ignore-system-fonts"]
for directory in fonts.split(os.pathsep):
    if directory:
        command += ["--font-path", directory]
command += [str(root / "math-paper.typ"), str(root / "math-paper.pdf")]
environment = {key: value for key, value in os.environ.items() if key in ("PATH", "LANG", "TMPDIR")}
environment.update(RAYON_NUM_THREADS="2", TYPST_PACKAGE_PATH=packages, TYPST_PACKAGE_CACHE_PATH=packages)
subprocess.run(command, env=environment, check=True, timeout=30)
