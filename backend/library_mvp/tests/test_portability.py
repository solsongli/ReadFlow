"""Windows portability guards for the research library (the protected Windows build compiles this package)."""
import ast
from pathlib import Path
import unittest

PACKAGE = Path(__file__).resolve().parents[1]
# Receivers whose .open() returns binary PDF, image or archive handles.
BINARY_OPENERS = {"fitz", "pymupdf", "Image", "tarfile", "zipfile", "gzip", "archive", "zf", "tar", "document", "pdf", "wheel"}


def _mode(node, index):
    if len(node.args) > index and isinstance(node.args[index], ast.Constant):
        return node.args[index].value
    return next((k.value.value for k in node.keywords if k.arg == "mode" and isinstance(k.value, ast.Constant)), None)


def default_encoding_calls(tree):
    """Text reads/writes that would use the Windows ANSI code page instead of UTF-8."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or any(k.arg == "encoding" for k in node.keywords):
            continue
        fn = node.func
        if isinstance(fn, ast.Attribute) and fn.attr in ("read_text", "write_text"):
            yield node
        elif (isinstance(fn, ast.Name) and fn.id == "open") or (isinstance(fn, ast.Attribute) and fn.attr == "fdopen"):
            if "b" not in (_mode(node, 1) or ""):
                yield node
        elif isinstance(fn, ast.Attribute) and fn.attr == "open":
            root = fn.value
            while isinstance(root, ast.Attribute):
                root = root.value
            if not (isinstance(root, ast.Name) and root.id in BINARY_OPENERS | {"os", "io"}) and "b" not in (_mode(node, 0) or ""):
                yield node


class PortabilityTests(unittest.TestCase):
    def test_text_io_declares_utf8(self):
        # A Windows build failed writing paper blocks: Python there defaults to cp1252 outside UTF-8 mode.
        missing = [f"{path.name}:{node.lineno}" for path in sorted(PACKAGE.glob("*.py"))
                   for node in default_encoding_calls(ast.parse(path.read_text(encoding="utf-8")))]
        self.assertEqual(missing, [])

    def test_guard_recognises_text_and_binary_calls(self):
        source = ("p.read_text()\nopen(x)\nos.fdopen(fd, 'w')\np.open('w')\n"
                  "open(x, 'rb')\nfitz.open(x)\nwheel.open(i)\np.read_text(encoding='utf-8')\n")
        self.assertEqual([n.lineno for n in default_encoding_calls(ast.parse(source))], [1, 2, 3, 4])


if __name__ == "__main__":
    unittest.main()
