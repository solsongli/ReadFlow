"""Only synthetic providers: JSON variants, isolated retries, glossary errors and safe diagnostics."""
import json
import re
import unittest
import httpx
from backend.library_mvp.paper_json import read_payload, ModelJSONError
from backend.library_mvp.paper_blocks_translate import parse_response, translate_blocks
from backend.library_mvp.paper_translation_response import restore_fields
from backend.library_mvp.paper_prompts import messages_for
from backend.library_mvp.paper_blocks_model import cache_key, protected_ranges
from backend.library_mvp.paper_terms import propose
from backend.library_mvp.paper_diagnostics import diagnostic, global_failure
from backend.library_mvp.paper_blocks_transport import run_batch
from backend.library_mvp.paper_markers import has_markers
from ops.development.readflow_fake_openai import completion_response


def block(identity, **extra):
    return {
        "id": identity,
        "text": "Task. The policy achieves 95% in 20 trials [1].",
        "page": 1,
        "type": "text",
        "protected": protected_ranges("Task. The policy achieves 95% in 20 trials [1]."),
        "anchors": [{"page": 1}],
        "source_lines": [{"lead": "Task."}],
        **extra,
    }


class ModelRobustnessTests(unittest.TestCase):
    def test_json_fences_prose_mapping_numeric_ids_case_fullwidth_and_partial(self):
        cases = [
            '说明 ```JSON\n{"BLOCKS":{"123":{"TEXT":"译文","HEAD":null,"extra":1}}}\n```结束',
            '{"Blocks":[{"ID":123,"TEXT":"译文","HEAD":""}]}',
            "｛＂BLOCKS＂：｛＂123＂：＂译文，含全角逗号＂｝｝",
            '{"blocks":[{"id":123,"text":"译文"},{"id":"cut","text":"truncated',
            '{"blocks":{"123":"译文","456":"unfinished',
        ]
        for raw in cases:
            with self.subTest(raw=raw):
                value = parse_response(raw, structured=True, strict=True)
                self.assertIn("123", value)
                self.assertTrue(value["123"]["text"].startswith("译文"))
        self.assertEqual(parse_response('{"blocks":[{"id":"cut","text":"unfinished'), {})
        with self.assertRaises(ModelJSONError):
            read_payload("not JSON", "blocks")

    def test_head_missing_null_empty_or_merged_keeps_text_and_local_style(self):
        row = block("123")
        _, maps = messages_for([row], [], "zh-CN")
        for head in (None, ""):
            value = restore_fields(
                row, {"text": "任务。策略在20次试验中达到95% " + next(iter(maps["123"])) + "。", "head": head}, maps["123"]
            )
            self.assertTrue(value["runs"][0]["bold"])
            self.assertFalse(has_markers(value))
        merged = restore_fields(row, {"text": "任务。 策略可靠。", "head": "任务。"}, {})
        self.assertEqual(merged["text"], "任务。 策略可靠。")
        no_boundary = restore_fields(row, {"text": "策略可靠"}, {})
        self.assertEqual(no_boundary["text"], "策略可靠")
        self.assertFalse(any(r.get("bold") for r in no_boundary["runs"]))

    def test_terms_mapping_case_and_extra_fields(self):
        result = propose(
            [{"source": "policy", "target": "policy", "keep": False}],
            lambda _: '说明 ```json\n{"TERMS":{"policy":{"TARGET":"策略","score":999}}}\n```结束',
            "zh-CN",
        )
        self.assertEqual(result[0]["target"], "策略")

    def test_local_exception_is_retried_and_does_not_discard_successful_blocks(self):
        rows = [block("1"), block("2")]
        cache, attempts, details = {}, 0, []

        def call(messages):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise httpx.ConnectTimeout("")
            payload = json.loads(messages[-1]["content"])
            return json.dumps(
                {
                    "blocks": {
                        b["id"]: "任务。策略在20次试验中达到95% "
                        + " ".join(re.findall(r"__RF_[A-Za-z0-9_]+__", b["text"]))
                        + "。"
                        for b in payload["blocks"]
                    }
                }
            )

        failed = translate_blocks(
            rows,
            cache,
            "zh-CN",
            "test",
            call,
            [{"source": "policy", "target": "策略"}],
            lambda: None,
            lambda *_: None,
            lambda _: None,
            concurrency=1,
            quality=True,
            diagnose=lambda e, s: details.append(diagnostic(e, s)),
            plan=lambda values, *_: [values],
        )
        self.assertEqual(failed, [])
        self.assertEqual(len(cache), 2)
        self.assertEqual(details[0]["exception"], "ConnectTimeout")
        self.assertEqual(details[0]["stage"], "batch")
        self.assertTrue(all(not v["qa"]["issues"] for v in cache.values()))

    def test_terminology_strict_retry_is_once_then_review(self):
        calls, cache = [], {}
        row = block("1")

        def call(messages):
            calls.append(json.loads(messages[-1]["content"]))
            marker = re.findall(r"__RF_[A-Za-z0-9_]+__", calls[-1]["blocks"][0]["text"])[0]
            return json.dumps({"blocks": {"1": "任务。方针在20次试验中达到95% " + marker + "。"}})

        translate_blocks(
            [row],
            cache,
            "zh-CN",
            "test",
            call,
            [{"source": "policy", "target": "策略"}],
            lambda: None,
            lambda *_: None,
            lambda _: None,
            concurrency=1,
            quality=True,
        )
        self.assertEqual(len(calls), 2)
        self.assertEqual(cache[cache_key(row, "zh-CN", "test")]["qa"]["issues"], ["terminology"])

    def test_http_diagnostics_global_balance_and_no_response_echo(self):
        captured = []

        def callback(request):
            return httpx.Response(
                402,
                json={"error": {"code": "insufficient_balance", "message": "private source and fake secret"}},
            )

        try:
            run_batch(
                {"base_url": "http://127.0.0.1:9/v1", "model": "fixture", "api_key": ""},
                [],
                transport=httpx.MockTransport(callback),
                backoff=lambda *_: None,
            )
        except Exception as error:
            captured.append(diagnostic(error, "batch"))
            self.assertTrue(global_failure(error))
        self.assertEqual(captured[0]["http_status"], 402)
        self.assertEqual(captured[0]["provider_code"], "insufficient_balance")
        self.assertNotIn("private source", json.dumps(captured))
        self.assertNotIn("fake secret", json.dumps(captured))

    def test_fake_all_variants_finish_quality_and_markers(self):
        rows = [block(str(i)) for i in range(1, 16)]
        cache, counter = {}, 0

        def call(messages):
            nonlocal counter
            status, response = completion_response(
                {"model": "readflow-real-variants", "messages": messages}, counter
            )
            counter += 1
            self.assertEqual(status, 200)
            return {"content": response["choices"][0]["message"]["content"], "usage": response["usage"]}

        failed = translate_blocks(
            rows,
            cache,
            "zh-CN",
            "test",
            call,
            [{"source": "policy", "target": "策略"}],
            lambda: None,
            lambda *_: None,
            lambda _: None,
            concurrency=1,
            quality=True,
            plan=lambda values, *_: [values[i : i + 2] for i in range(0, len(values), 2)],
        )
        self.assertEqual(failed, [])
        self.assertEqual(len(cache), len(rows))
        self.assertTrue(all(not has_markers(v) for v in cache.values()))
        self.assertTrue(all(not v["qa"]["issues"] for v in cache.values()), [v["qa"] for v in cache.values()])
