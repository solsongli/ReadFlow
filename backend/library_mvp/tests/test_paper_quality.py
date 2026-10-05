"""X8 uses only deterministic fake responses and synthetic document text."""
import json
from pathlib import Path
import tempfile
import unittest
from backend.library_mvp.paper_terms import candidates, effective, relevant, propose, save, load
from backend.library_mvp.paper_quality import checks, summary
from backend.library_mvp.paper_context import contextualize, protected_text
from backend.library_mvp.paper_blocks_inline import restore_rich
from backend.library_mvp.paper_blocks_model import protected_ranges, cache_key
from backend.library_mvp.paper_blocks_translate import translate_blocks
from backend.library_mvp.layout_text import html_runs, allocate
from ops.development.readflow_fake_openai import completion_response
from ops.development.paper_quality_report import measure


def block(text, identity="abcdefghijklmnopqrstuvwx", **extra):
    return {
        "id": identity,
        "text": text,
        "type": "text",
        "page": 1,
        "anchors": [{"page": 1}],
        "protected": protected_ranges(text),
        **extra,
    }


class PaperQualityTests(unittest.TestCase):
    def test_candidate_acronym_repeat_and_names(self):
        rows = candidates(
            [
                block(
                    "Vision-Language-Action (VLA) uses reinforcement learning. "
                    "OpenVLA and ImageNet improve reinforcement learning.",
                    type="abstract",
                )
            ]
        )
        entries = {r["source"].lower(): r for r in rows}
        self.assertIn("vision-language-action", entries)
        self.assertIn("reinforcement learning", entries)
        self.assertTrue(entries["vla"]["keep"])
        self.assertTrue(entries["openvla"]["keep"])

    def test_glossary_priority_relevance_and_single_small_proposal(self):
        paper = [{"source": "policy", "target": "策略"}, {"source": "dataset", "target": "数据集"}]
        merged = effective(paper, [{"source": "policy", "target": "策略函数"}])
        selected = relevant(merged, [block("The policy improves.")])
        self.assertEqual([r["target"] for r in selected], ["策略函数"])
        calls = []

        def fake(messages):
            calls.append(messages)
            return '{"terms":[{"source":"VLA","target":"不应替换"}]}'

        result = propose([{"source": "VLA", "target": "VLA", "keep": True}], fake, "zh-CN")
        self.assertEqual(len(calls), 1)
        self.assertIn("Simplified Chinese", calls[0][0]["content"])
        self.assertEqual(result[0]["target"], "VLA")
        self.assertEqual(
            propose(
                [{"source": "policy", "target": "policy", "keep": False}], lambda _: "malformed", "zh-CN"
            ),
            [],
        )
        with tempfile.TemporaryDirectory() as temp:
            save(Path(temp), "zh-CN", {"entries": merged, "revision": 1, "prepared": True})
            self.assertEqual(load(Path(temp), "zh-CN")["entries"], merged)

    def test_numeric_reference_latin_length_and_terms_checks(self):
        source = block(
            "We report policy accuracy of 95% for 20 episodes [12], and obtain reliable evaluation results."
        )
        terms = [{"source": "policy", "target": "策略"}]
        good = {"text": "我们报告策略在20个回合中准确率为95% [12]，并取得可靠的评估结果。"}
        self.assertEqual(checks(source, good, terms=terms), [])
        self.assertIn("numbers", checks(source, {"text": good["text"].replace("95%", "90%")}, terms=terms))
        self.assertIn("citations", checks(source, {"text": good["text"].replace("[12]", "")}, terms=terms))
        self.assertIn("terminology", checks(source, {"text": good["text"].replace("策略", "方针")}, terms=terms))
        self.assertIn("untranslated", checks(source, {"text": source["text"]}))
        self.assertIn("length", checks(source, {"text": "结果"}))
        self.assertEqual(checks(source, None), ["placeholders"])
        self.assertIn("numbers", checks(block("95% 95%"), {"text": "95%"}))

    def test_context_first_occurrence_and_local_bold_roundtrip(self):
        first = block("Task. The policy is robust.", source_lines=[{"lead": "Task."}])
        second = block("and the policy generalizes.", "second", anchors=[{"page": 1}, {"page": 2}])
        rows = contextualize([first, second], [{"source": "policy", "target": "策略"}])
        self.assertEqual(rows[0]["first_terms"], ["policy"])
        self.assertEqual(rows[1]["first_terms"], [])
        self.assertEqual(rows[1]["previous_sentence"], "The policy is robust.")
        masked, mapping = protected_text(rows[0])
        rich = restore_rich(masked.replace("Task.", "任务。"), mapping)
        self.assertTrue(next(r for r in rich["runs"] if r["text"] == "任务。")["bold"])
        self.assertIn("<strong>任务。</strong>", html_runs(rich["runs"]))
        self.assertTrue(any(r.get("bold") for p in allocate(rich["runs"], [1, 1]) for r in p))

    def test_selective_strict_retry_and_batch_term_injection(self):
        bad = block("We report policy accuracy of 95% on 20 episodes [12].")
        good = block("Our policy is reliable.", "second")
        calls, cache = [], {}

        def call(messages):
            payload = json.loads(messages[-1]["content"])
            calls.append((payload, messages[0]["content"]))
            strict = "STRICT_REVIEW" in messages[0]["content"]
            rows = []
            for row in payload["blocks"]:
                text = row["text"] if row["id"] == bad["id"] and not strict else "研究中的策略可靠。"
                if strict:
                    text += "95% 20 " + next(iter(protected_text(bad)[1]))
                rows.append({"id": row["id"], "text": text})
            return json.dumps({"blocks": rows})

        terms = [{"source": "policy", "target": "策略"}, {"source": "unused", "target": "无关"}]
        translate_blocks(
            [bad, good],
            cache,
            "zh-CN",
            "fake",
            call,
            terms,
            lambda: None,
            lambda *_: None,
            lambda _: None,
            concurrency=1,
            quality=True,
            plan=lambda rows, *_: [rows],
        )
        self.assertEqual(len(calls), 2)
        self.assertEqual([r["id"] for r in calls[1][0]["blocks"]], [bad["id"]])
        self.assertNotIn("unused", calls[0][1])
        self.assertEqual(summary(cache.values()), {"checked": 2, "retried": 1, "needs_review": 0})

    def test_fake_faults_and_offline_metrics(self):
        sample = block("We report policy accuracy of 95% on 20 episodes [12].")
        terms = [{"source": "policy", "target": "策略"}]
        for model in ("readflow-qa-untranslated", "readflow-qa-citation", "readflow-qa-terms"):
            cache = {}

            def call(messages):
                response = completion_response({"model": model, "messages": messages})[1]
                return response["choices"][0]["message"]["content"]

            translate_blocks(
                [sample],
                cache,
                "zh-CN",
                "fake",
                call,
                terms,
                lambda: None,
                lambda *_: None,
                lambda _: None,
                concurrency=1,
                quality=True,
            )
            result = cache[cache_key(sample, "zh-CN", "fake")]
            self.assertTrue(result["qa"]["retried"])
            self.assertEqual(result["qa"]["issues"], [])
            report = measure({"blocks": [sample]}, cache, "zh-CN", "fake", terms)
            self.assertEqual(report["retention"]["numbers"]["rate"], 1)
            self.assertEqual(report["terminology"]["rate"], 1)
