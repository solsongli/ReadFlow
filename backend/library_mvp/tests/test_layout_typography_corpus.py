"""The comparison copies allowlisted files only and never writes through symlinks."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from ops.development.layout_typography_corpus import copy_inputs


class ReadOnlyTypographyInputs(unittest.TestCase):
    def test_only_allowlisted_json_and_original_blob_are_copied(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            library = root / "library"
            sha = "c6ca524e" + "0" * 56
            folder = library / "paper-blocks" / sha
            folder.mkdir(parents=True)
            (folder / "blocks.json").write_text(
                json.dumps({"blocks": [{"type": "title", "text": "Fixture"}]})
            )
            (folder / "translations.json").write_text("{}")
            (folder / "not-allowed.txt").write_text("Never copied")
            blob = library / "blobs" / sha[:2] / (sha + ".pdf")
            blob.parent.mkdir(parents=True)
            blob.write_bytes(b"%PDF-synthetic-copy-fixture")
            original = hashlib.sha256((folder / "blocks.json").read_bytes()).hexdigest()
            output = root / "comparison"
            result = copy_inputs(library, output)
            self.assertEqual(len(result), 1)
            self.assertEqual(
                set(p.name for p in (output / "SAM").iterdir()),
                {"blocks.json", "translations.json", "source.pdf"},
            )
            self.assertEqual(original, hashlib.sha256((folder / "blocks.json").read_bytes()).hexdigest())
            stamp = (output / "SAM/source.pdf").stat().st_mtime_ns
            copy_inputs(library, output)
            self.assertEqual((output / "SAM/source.pdf").stat().st_mtime_ns, stamp)

    def test_an_output_symlink_cannot_write_into_the_input_library(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            library = root / "library"
            folder = library / "paper-blocks" / ("c6ca524e" + "0" * 56)
            folder.mkdir(parents=True)
            content = json.dumps({"blocks": [{"type": "title", "text": "Fixture"}]})
            (folder / "blocks.json").write_text(content)
            output = root / "comparison"
            output.mkdir()
            (output / "SAM").symlink_to(folder, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symbolic links"):
                copy_inputs(library, output)
            self.assertEqual((folder / "blocks.json").read_text(), content)
