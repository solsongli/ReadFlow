"""Local-only malformed-marker regressions; no real service, secrets or user writes."""
import json
import os
import hashlib
from pathlib import Path
import tempfile
import unittest
from backend.library_mvp.paper_markers import clean_rich, has_markers
from backend.library_mvp.paper_blocks_model import protect, cache_key
from backend.library_mvp.paper_blocks_inline import restore_rich
from backend.library_mvp.paper_blocks_translate import translate_blocks
from backend.library_mvp.paper_translation_response import restore_fields
from backend.library_mvp.paper_prompts import messages_for
from backend.library_mvp.paper_cache_repair import normalize_cache
from backend.library_mvp.paper_quality import checks
from ops.development.paper_quality_report import measure
from ops.development.readflow_fake_openai import completion_response


def sample(**extra):
    return {
        "id": "0123456789ab0123456789ab",
        "type": "text",
        "page": 1,
        "text": "Task. Value x2 is 95% [1].",
        "anchors": [{"page": 1}],
        "source_lines": [{"lead": "Task."}],
        "protected": [
            {
                "start": 12,
                "end": 14,
                "text": "x2",
                "runs": [{"kind": "text", "text": "x"}, {"kind": "super", "text": "2"}],
            }
        ],
        **extra,
    }


class InternalMarkerTests(unittest.TestCase):
    def test_structured_head_and_whole_block_titles_never_send_bold_tokens(self):
        for kind in ("text", "title", "heading"):
            row = sample(type=kind)
            messages, maps = messages_for([row], [], "zh-CN")
            self.assertNotIn("BOLD", json.dumps(messages))
            body = json.loads(messages[-1]["content"])["blocks"][0]
            if kind == "text":
                self.assertEqual(body["head"], "Task.")
                self.assertFalse(body["text"].startswith("Task."))
                value = restore_fields(row, {"head": "任务。", "text": body["text"]}, maps[row["id"]])
                self.assertTrue(value["runs"][0]["bold"])
                self.assertTrue(any(r["kind"] == "super" for r in value["runs"]))
            else:
                self.assertNotIn("head", body)

    def test_legacy_bold_variants_pairs_orphans_and_existing_scripts(self):
        variants = [
            ("__BOLD_START__", "__BOLD_END__"),
            ("BOLD_START", "BOLD_END"),
            ("b o l d _ s t a r t", "bOlD EnD"),
            ("BOLDSTART", "BOLDEND"),
            ("__RF_0123456789ab_BOLD_START__", "rf0123456789abBOLDEND"),
        ]
        for start, end in variants:
            with self.subTest(start=start):
                repaired, info = clean_rich(
                    {
                        "text": start + "标题" + end + " 正文",
                        "runs": [
                            {"kind": "text", "text": start + "标题" + end + " "},
                            {"kind": "super", "text": "正文"},
                        ],
                    }
                )
                self.assertEqual(repaired["text"], "标题 正文")
                self.assertTrue(repaired["runs"][0]["bold"])
                self.assertEqual(repaired["runs"][-1]["kind"], "super")
                self.assertFalse(has_markers(repaired))
                self.assertEqual(info["unresolved"], 0)
        value, _ = clean_rich("BOLD_END孤立。 普通 BOLD_END")
        self.assertEqual(value["text"], "孤立。 普通 ")
        self.assertFalse(any(r.get("bold") for r in value["runs"]))
        orphan, _ = clean_rich("BOLD_START孤立。")
        self.assertEqual(orphan["text"], "孤立。")
        self.assertFalse(any(r.get("bold") for r in orphan["runs"]))

    def test_math_variants_restore_local_super_and_whitespace_or_fail_closed(self):
        row = sample(source_lines=[])
        masked, mapping = protect(row)
        token = next(iter(mapping))
        for mutated in (
            token.lower(),
            token.replace("_", ""),
            token.replace("_", " ").lower(),
            " ".join(token),
        ):
            result = restore_rich(masked.replace(token, mutated), mapping)
            self.assertEqual(result["text"], row["text"])
            self.assertTrue(any(r["kind"] == "super" and r["text"] == "2" for r in result["runs"]))
            self.assertFalse(has_markers(result))
        clean, info = clean_rich("text __RF_unknown__ rf0123456789ab99 remaining")
        self.assertFalse(has_markers(clean))
        self.assertEqual(info["unresolved"], 2)
        self.assertIn("internal_markers", checks(row, clean))
        self.assertIsNone(restore_rich(masked.replace(token, "rf0123456789ab999"), mapping))

    def test_cache_normalization_cleans_text_runs_and_is_idempotent(self):
        block = sample(type="heading")
        key = cache_key(block, "zh-CN", "fixture")
        cache = {
            key: {
                "text": "__BOLD_START__章节BOLD_END",
                "runs": [{"kind": "text", "text": "__BOLD_START__章节BOLD_END"}],
                "qa": {"issues": [], "retried": False},
            }
        }
        report = measure({"blocks": [block]}, cache, "zh-CN", "fixture")
        self.assertEqual(report["internal_marker_blocks"], 1)
        patch, info = normalize_cache({"blocks": [block]}, cache)
        self.assertEqual(info["entries"], 1)
        cache.update(patch)
        self.assertFalse(has_markers(cache[key]))
        self.assertTrue(cache[key]["runs"][0]["bold"])
        empty, _ = normalize_cache({"blocks": [block]}, {"empty": "BOLD_START"})
        self.assertIn("internal_markers", empty["empty"]["qa"]["issues"])
        self.assertEqual(empty["empty"]["text"], "")
        self.assertEqual(normalize_cache({"blocks": [block]}, cache)[0], {})
        self.assertEqual(measure({"blocks": [block]}, cache, "zh-CN", "fixture")["internal_marker_blocks"], 0)

    def test_cached_math_and_structured_superscripts_are_recovered_without_a_model(self):
        row = sample(source_lines=[])
        masked, mapping = protect(row)
        token = next(iter(mapping))
        cache = {"old": {"text": masked.replace(token, token.replace("_", "").lower())}}
        patch, info = normalize_cache({"blocks": [row]}, cache)
        self.assertEqual(info["unresolved"], 0)
        self.assertEqual(patch["old"]["text"], row["text"])
        self.assertTrue(any(r["kind"] == "super" for r in patch["old"]["runs"]))
        value, _ = clean_rich("x __sUb_sTaRt__i SUB_END __SUPER_START__2 super_end")
        self.assertFalse(has_markers(value))
        self.assertTrue(any(r["kind"] == "sub" and r["text"].strip() == "i" for r in value["runs"]))
        self.assertTrue(any(r["kind"] == "super" and r["text"].strip() == "2" for r in value["runs"]))

    def test_fake_mutation_and_unknown_marker_strict_retry_is_selective(self):
        rows = [
            sample(),
            sample(id="aaaaaaaaaaaa111111111111", source_lines=[], text="Result 95%.", protected=[]),
        ]
        cache, calls = {}, []

        def call(messages):
            payload = json.loads(messages[-1]["content"])
            calls.append(payload)
            output = []
            for b in payload["blocks"]:
                result = {"id": b["id"], "text": b["text"], **({"head": b["head"]} if "head" in b else {})}
                if b["id"] == rows[1]["id"] and "review" not in payload:
                    result["text"] += " __RF_unknown__"
                output.append(result)
            return json.dumps({"blocks": output})

        translate_blocks(
            rows,
            cache,
            "en",
            "fixture",
            call,
            [],
            lambda: None,
            lambda *_: None,
            lambda _: None,
            quality=True,
            concurrency=1,
            plan=lambda values, *_: [values],
        )
        self.assertEqual(len(calls), 2)
        self.assertEqual([b["id"] for b in calls[1]["blocks"]], [rows[1]["id"]])
        self.assertTrue(all(not has_markers(v) for v in cache.values()))
        messages, maps = messages_for([rows[0]], [], "zh-CN")
        output = completion_response({"model": "readflow-marker-variants", "messages": messages})[1]
        raw = json.loads(output["choices"][0]["message"]["content"])["blocks"][0]
        value = restore_fields(rows[0], raw, maps[rows[0]["id"]])
        self.assertIsNotNone(value)
        self.assertFalse(has_markers(value))

    def test_real_sam_cache_readonly(self):
        directory = os.environ.get("READFLOW_MARKER_CACHE")
        if not directory:
            self.skipTest("Optional read-only SAM cache absent; set READFLOW_MARKER_CACHE")
        root = Path(directory)
        paths = [root / "blocks.json", root / "translations.json"]
        for path in paths:
            self.assertTrue(path.is_file())
            self.assertFalse(any(p.is_symlink() for p in (path, *path.parents)))
        content = [p.read_bytes() for p in paths]
        document, cache = [json.loads(raw) for raw in content]
        patch, counts = normalize_cache(document, cache)
        expected = sum(has_markers(value) for value in cache.values())
        self.assertEqual(counts["entries"], expected)
        cache.update(patch)
        self.assertFalse(any(has_markers(value) for value in cache.values()))
        self.assertEqual(normalize_cache(document, cache)[0], {})
        self.assertEqual(
            [hashlib.sha256(p.read_bytes()).digest() for p in paths],
            [hashlib.sha256(raw).digest() for raw in content],
        )
