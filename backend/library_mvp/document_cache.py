"""Per-page inference caches, kept inside the registered paper-blocks directory."""
import json
import os
from pathlib import Path
import tempfile


def cached(root, name, identity, compute):
    path = Path(root) / name
    if path.is_symlink():
        raise ValueError("Inference cache cannot be a symbolic link")
    if path.is_file():
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if value.get("identity") == identity:
                return value["value"]
        except (ValueError, KeyError):
            pass
    value = compute()
    fd, temporary = tempfile.mkstemp(prefix=".inference-", dir=root)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump({"schema_version": 1, "identity": identity, "value": value}, output, ensure_ascii=False)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return value
