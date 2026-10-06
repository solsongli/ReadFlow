"""Presentation glyphs expand without cache invalidation or lost mathematical offsets."""
import json
from pathlib import Path
import tempfile
import unittest
import pymupdf as fitz
from backend.library_mvp.paper_text_normalization import expand_ligatures, normalized_document
from backend.library_mvp.paper_terms import candidates, normalize, effective
from backend.library_mvp.paper_term_matching import occurs
from backend.library_mvp.paper_quality_text import term_present
from backend.library_mvp.paper_blocks_model import cache_key
from backend.library_mvp.store import Store
from backend.library_mvp.paper_blocks_storage import BlockStorage, write_json
from backend.library_mvp.paper_blocks_model import SCHEMA_VERSION, EXTRACTOR_VERSION


class LigatureTermTests(unittest.TestCase):
    def test_ligatures_only_and_protected_offsets(self):
        self.assertEqual(expand_ligatures("ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ x²"), "ff fi fl ffi ffl st st x²")
        text = "ﬁne x² [1]"
        row = {
            "id": "original",
            "text": text,
            "protected": [{"start": 4, "end": 6, "text": "x²", "runs": [{"kind": "super", "text": "²"}]}],
        }
        value = normalized_document(row)
        self.assertEqual(value["id"], "original")
        self.assertEqual(value["protected"][0]["start"], 5)
        self.assertEqual(value["text"][5:7], "x²")
        self.assertEqual(value["protected"][0]["runs"][0]["kind"], "super")
        self.assertEqual(cache_key(row, "zh-CN", "service"), cache_key(value, "zh-CN", "service"))

    def test_full_word_candidates_and_automatic_caps_filter(self):
        values = candidates(
            [
                {
                    "type": "abstract",
                    "page": 1,
                    "text": "ﬁne manipulation and fine manipulation. AND FOR ACTION BIMANUAL EXPERIMENTS. "
                    "ne manipulation and ne manipulation. Action Chunking with Transformers (ACT) uses ALOHA.",
                }
            ]
        )
        sources = {r["source"].lower() for r in values}
        self.assertIn("fine manipulation", sources)
        self.assertNotIn("ne manipulation", sources)
        self.assertFalse(sources & {"and", "for", "action", "bimanual", "experiments"})
        self.assertIn("act", sources)
        self.assertIn("aloha", sources)
        automatic = [
            {"source": "ne manipulation", "target": "ne操作", "kind": "term", "score": 60},
            {"source": "AND", "target": "AND", "kind": "name", "score": 20},
        ]
        self.assertEqual(normalize(automatic), [])
        self.assertEqual(effective(automatic, [{"source": "AND", "target": "且"}])[0]["target"], "且")

    def test_complete_words_inflections_hyphens_and_fixed_user_targets(self):
        self.assertFalse(occurs("ne manipulation", "fine manipulation"))
        self.assertTrue(occurs("fine manipulation", "ﬁne manipulation"))
        self.assertTrue(occurs("policy", "POLICIES improve"))
        self.assertFalse(occurs("policy", "policymaker"))
        self.assertTrue(occurs("vision-language model", "Vision Language Models"))
        self.assertFalse(occurs("ACT", "action"))
        self.assertTrue(term_present({"source": "VLA", "target": "VLA", "keep": True}, "基于VLA模型"))
        self.assertFalse(term_present({"source": "VLAs", "target": "VLAs", "user": True}, "VLA"))

    def test_existing_block_ids_and_cache_bytes_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp))
            try:
                with fitz.open() as pdf:
                    pdf.new_page().insert_text((50, 150), "Ligature migration")
                    entry = store.add_pdf(pdf.tobytes(), filename="fixture.pdf")["attachment"]
                storage = BlockStorage(store)
                root = storage.directory(entry)
                row = {
                    "id": "old-id",
                    "type": "text",
                    "text": "ﬁne manipulation",
                    "protected": [],
                    "page": 1,
                    "anchors": [],
                }
                write_json(
                    root / "blocks.json",
                    {
                        "schema_version": SCHEMA_VERSION,
                        "extractor_version": EXTRACTOR_VERSION,
                        "blocks": [row],
                    },
                )
                key = cache_key(row, "zh-CN", "test")
                write_json(root / "translations.json", {key: {"text": "精细操作"}})
                before = (root / "translations.json").read_bytes()
                loaded = storage.load(entry, accept_stale=True)
                self.assertEqual(loaded["blocks"][0]["id"], "old-id")
                self.assertEqual(loaded["blocks"][0]["text"], "fine manipulation")
                self.assertEqual(before, (root / "translations.json").read_bytes())
                self.assertIn(key, storage.cache(entry))
            finally:
                store.close()
