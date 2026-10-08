"""Fetch only the pinned public assets; never imports a model vendor's Python wrapper."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).with_name("manifest.json")
CACHE = ROOT / ".model-cache"


def verified(path, entry):
    return (
        path.is_file()
        and not path.is_symlink()
        and path.stat().st_size == entry["bytes"]
        and hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]
    )


def safe_target(root, relative):
    name = PurePosixPath(relative)
    if name.is_absolute() or ".." in name.parts or "\\" in relative:
        raise ValueError("Unsafe component path")
    target = root / relative
    if any(p.is_symlink() for p in [target, *target.parents]):
        raise ValueError("Component paths cannot use symbolic links")
    return target


def entries(manifest, *, models_only=False):
    # The pinned wheels are Linux builds; a Windows bundle installs its own wheels with pip
    # and takes only the platform-independent models from this manifest.
    return [e for e in manifest["files"] if not (models_only and e["kind"] == "wheel")]


def fetch(cache=CACHE, *, offline=False, models_only=False):
    manifest = json.loads(MANIFEST.read_text())
    for entry in entries(manifest, models_only=models_only):
        target = safe_target(cache, entry["path"])
        if verified(target, entry):
            continue
        if offline:
            raise ValueError("Missing or corrupt pinned component: " + entry["path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
            pending = Path(output.name)
        try:
            # The file is reopened so it is closed before the rename: Windows cannot replace an open file.
            with pending.open("wb") as output:
                # urllib does not read netrc or browser credentials.
                with urllib.request.urlopen(entry["url"], timeout=90) as response:
                    if not response.url.startswith("https://"):
                        raise ValueError("An HTTPS component source is required")
                    copied = 0
                    while chunk := response.read(1024 * 1024):
                        copied += len(chunk)
                        if copied > entry["bytes"]:
                            raise ValueError("Component exceeds its pinned byte size")
                        output.write(chunk)
            if not verified(pending, entry):
                raise ValueError("Size/SHA-256 mismatch: " + entry["path"])
            pending.replace(target)
        finally:
            pending.unlink(missing_ok=True)
        print("Verified", entry["path"], flush=True)
    return manifest


def stage(destination, cache=CACHE, *, models_only=False):
    """A separate site directory is also usable by CI; licenses and metadata are retained."""
    manifest = fetch(cache, offline=True, models_only=models_only)
    for entry in entries(manifest, models_only=models_only):
        source = safe_target(cache, entry["path"])
        if entry["kind"] == "wheel":
            with zipfile.ZipFile(source) as archive:
                for member in archive.infolist():
                    parts = PurePosixPath(member.filename).parts
                    # Inference does not use tests, C headers, command-line tooling or bytecode.
                    if any(p in {"tests", "test", "__pycache__", "include"} for p in parts):
                        continue
                    if member.is_dir() or member.filename.endswith(".pyi"):
                        continue
                    if parts[0] == "numpy" and (
                        parts[1] in {"f2py", "distutils"} or parts[-1].startswith("_simd.")
                    ):
                        # Fortran build tooling and experimental SIMD test bindings;
                        # normal NumPy ufunc SIMD dispatch remains in _multiarray_umath.
                        continue
                    # The Python extension statically includes ORT. Its separate C SDK library,
                    # training/quantization tooling and bundled datasets are not used by InferenceSession.
                    if parts[0] == "onnxruntime" and (
                        parts[1] in {"tools", "quantization", "transformers", "datasets", "backend"}
                        or member.filename.rsplit("/", 1)[-1].startswith("libonnxruntime.so")
                    ):
                        continue
                    target = safe_target(destination / "site", member.filename)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(member))
        else:
            target = safe_target(destination, entry["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    shutil.copyfile(MANIFEST, destination / "models" / "manifest.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--cache", type=Path, default=CACHE)
    parser.add_argument("--stage", type=Path)
    parser.add_argument("--models-only", action="store_true", help="skip the pinned (Linux) wheels")
    args = parser.parse_args()
    fetch(args.cache, offline=args.offline, models_only=args.models_only)
    if args.stage:
        stage(args.stage, args.cache, models_only=args.models_only)
