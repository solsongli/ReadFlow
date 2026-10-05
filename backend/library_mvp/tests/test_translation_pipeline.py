import unittest
import json
import threading
import os
from pathlib import Path
from backend.library_mvp import paper_blocks_translate as engine
from unittest.mock import patch
from backend.library_mvp.paper_quality import checks
from backend.library_mvp.paper_quality_text import quantities
from backend.library_mvp.translation_metrics import TranslationMetrics
from backend.library_mvp.tests.benchmark_translation_pipeline import measure
from backend.library_mvp.tests.benchmark_translation_pipeline import load_dataset
from backend.library_mvp.tests.translation_delay_fixture import synthetic_dataset


def block(text, kind="text", **extra):
    return {"text": text, "type": kind, "protected": [], **extra}


class TranslationPipelineTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('READFLOW_TRANSLATION_BENCH_DIR'), 'opt-in: read-only real-paper JSON set is not shipped in CI')
    def test_sam_json_delay_and_prompt_limits(self):
        dataset = load_dataset(Path(os.environ['READFLOW_TRANSLATION_BENCH_DIR']))
        old = measure(dataset, 'legacy', scale=.15)
        new = measure(dataset, 'new', scale=.15)
        self.assertLessEqual(new['wall_seconds'], old['wall_seconds'] * 1.2)
        self.assertLessEqual(new['estimated_prompt_tokens'], old['estimated_prompt_tokens'] * 1.3)
        self.assertTrue(new['qa_pipeline_overlap'])

    def test_four_failed_blocks_retry_while_another_main_request_is_inflight(self):
        release = threading.Event()
        blocks = [
            {"id": str(i), "text": "Original evidence.", "type": "text", "protected": []} for i in range(5)
        ]
        sizes = []

        def call(messages):
            rows = json.loads(messages[-1]["content"])["blocks"]
            strict = "STRICT_REVIEW" in messages[0]["content"]
            if strict:
                sizes.append(len(rows))
                release.set()
            elif len(rows) == 1:
                self.assertTrue(release.wait(3), "Retry must start before all main batches finish")
            return json.dumps(
                {"blocks": [{"id": b["id"], "text": "fixed" if strict else "initial"} for b in rows]}
            )

        def assess(b, v, *_):
            return ["numbers"] if b["id"] != "4" and v["text"] == "initial" else []

        with patch.object(engine, "checks", assess):
            cache = {}
            engine.translate_blocks(
                blocks,
                cache,
                "zh-CN",
                "fixture",
                call,
                [],
                lambda: None,
                lambda *_: None,
                lambda _: None,
                concurrency=2,
                quality=True,
                plan=lambda *_: [blocks[:4], blocks[4:]],
            )
        self.assertEqual(sizes, [4])
        self.assertEqual(len(cache), 5)

    def test_scaled_delayed_fake_keeps_speed_and_prompt_budgets(self):
        data = synthetic_dataset()
        old = measure(data, "legacy", scale=0.08)
        new = measure(data, "new", scale=0.08)
        self.assertLessEqual(new["wall_seconds"], old["wall_seconds"] * 1.2)
        self.assertLessEqual(new["estimated_prompt_tokens"], old["estimated_prompt_tokens"] * 1.3)
        self.assertTrue(new["qa_pipeline_overlap"])
        self.assertTrue(all(1 <= n <= 4 for n in new["strict_batches"]))
        self.assertLessEqual(new["performance"]["requests"]["max_concurrency"], 16)
        self.assertGreaterEqual(new["performance"]["requests"]["max_concurrency"], 8)

    def test_network_mean_excludes_waiting_permits_and_counts_overlap(self):
        clock = [0.0]
        metrics = TranslationMetrics(lambda: clock[0])
        metrics.network(1)
        clock[0] = 1
        metrics.network(1)
        clock[0] = 2
        metrics.network(-1)
        clock[0] = 3
        metrics.network(-1)
        value = metrics.snapshot()
        self.assertEqual(value["requests"]["max_concurrency"], 2)
        self.assertAlmostEqual(value["requests"]["mean_concurrency"], 1.333)
        self.assertEqual(
            set(value["timings_s"]),
            {"extraction", "terminology", "main_batches_wall", "qa_retranslation_wall", "render"},
        )

    def test_equivalent_scales_and_scripted_footnotes_are_not_number_loss(self):
        self.assertEqual(quantities('1e999999999'), quantities('1e999999999'))
        self.assertLess(max(map(len, quantities('1e999999'))), 20)
        for source, target in [
            ("7B parameters", "70亿参数"),
            ("11M images", "1100万图像"),
            ("28 million masks", "2800万掩码"),
            ("over a billion masks", "超过10亿掩码"),
        ]:
            self.assertNotIn("numbers", checks(block(source), {"text": target}))
        source = block(
            "Table 1.4 We report 1.4%.",
            protected=[{"text": "4", "start": 8, "end": 9, "runs": [{"kind": "super", "text": "4"}]}],
        )
        self.assertNotIn(
            "numbers",
            checks(
                source,
                {
                    "text": "表1。4 报告1.4%。",
                    "runs": [
                        {"kind": "text", "text": "表1。"},
                        {"kind": "super", "text": "4"},
                        {"kind": "text", "text": " 报告1.4%。"},
                    ],
                },
            ),
        )
        self.assertIn("numbers", checks(block("95% 95%"), {"text": "95% 90%"}))
        self.assertIn("numbers", checks(block("7B parameters"), {"text": "7亿参数"}))
        self.assertNotIn(
            "numbers", checks(block("SA-1B has 11M images."), {"text": "SA-1B 数据集，SA-1B 有1100万图像。"})
        )
        self.assertIn("numbers", checks(block("SA-1B has 11M images."), {"text": "SA-2B 有1100万图像。"}))

    def test_names_emails_and_acronym_plural_without_exempting_prose(self):
        self.assertNotIn(
            "untranslated",
            checks(
                block("Contact authors: author@example.edu", "footnote"), {"text": "联系作者：author@example.edu"}
            ),
        )
        term = {"source": "VLAs", "target": "VLAs", "keep": True}
        self.assertNotIn("terminology", checks(block("VLAs improve."), {"text": "VLA 有改善。"}, terms=[term]))
        self.assertIn(
            "terminology", checks(block("VLAs improve."), {"text": "VLA 有改善。"}, terms=[dict(term, user=True)])
        )
        self.assertNotIn(
            "untranslated",
            checks(block("Franka-Tabletop (5Hz)", "figure_text"), {"text": "Franka-Tabletop（5Hz）"}),
        )
        text = "We report reliable evaluation results with a substantially improved method."
        self.assertIn("untranslated", checks(block(text), {"text": text}))
        self.assertIn(
            "untranslated", checks(block("Average Success Rate", "heading"), {"text": "Average Success Rate"})
        )
