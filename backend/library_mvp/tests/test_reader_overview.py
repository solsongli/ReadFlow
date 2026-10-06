"""Overview uses fake transport only, never a configured model."""
import json
import threading
import unittest
from backend.library_mvp.tests import test_reader_assistance as fixtures
from backend.library_mvp.reader_overview_model import overview_context, validate_overview, SECTIONS
from backend.library_mvp.store import StoreError


class OverviewModelTests(unittest.TestCase):
    def test_bounded_context_prioritizes_evidence_and_keeps_reading_order(self):
        blocks = [
            {"id": str(i), "type": kind, "text": content, "page": i + 1}
            for i, (kind, content) in enumerate(
                [
                    ("title", "Title"),
                    ("abstract", "Abstract " * 300),
                    ("heading", "Introduction"),
                    ("text", "First introduction."),
                    ("text", "Last introduction."),
                    ("heading", "Methods"),
                    ("text", "Unselected ordinary text"),
                    ("text", "Success rate 98%."),
                    ("heading", "Conclusion"),
                    ("text", "Limited evidence."),
                    ("caption", "Figure 1."),
                    ("reference", "Excluded reference"),
                ]
            )
        ]
        result = overview_context({"title": "Title", "abstract": ""}, {"blocks": blocks}, 3000)
        combined = " ".join(r["text"] for r in result["excerpts"])
        self.assertIn("First introduction", combined)
        self.assertIn("Last introduction", combined)
        self.assertNotIn("Excluded", combined)
        self.assertNotIn("Unselected", combined)
        self.assertLess(len(combined), 3000)
        self.assertEqual(
            sorted(e["page"] for e in result["excerpts"]), [e["page"] for e in result["excerpts"]]
        )

    def test_page_range_and_evidence_validation(self):
        raw = {name: [{"text": "Evidence", "page": 1}] for name in SECTIONS}
        raw["methods"] *= 3
        raw["results"] = [{"text": "Unsupported", "page": 2}, {"text": "Bad", "page": 99}]
        value = validate_overview(json.dumps(raw), 3, {1})
        self.assertTrue(value["methods"][0]["trusted"])
        self.assertTrue(all(not row["trusted"] for row in value["results"]))
        with self.assertRaises(StoreError):
            validate_overview('{"methods": []}', 3, {1})


# Share fixture setup without inheriting and re-running the parent suite.
class OverviewServiceTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixtures.ReaderAssistanceTests.asyncSetUp
    asyncTearDown = fixtures.ReaderAssistanceTests.asyncTearDown
    payload = fixtures.ReaderAssistanceTests.payload

    def fixture(self):
        self.app.state.paper_blocks.storage.extract = lambda entry: {
            "blocks": [
                {"id": "title", "page": 1, "type": "title", "text": "Fixture title"},
                {"id": "abstract", "page": 2, "type": "abstract", "text": "Fixture summary"},
            ]
        }

        def chat(config, messages, delta=None, **kwargs):
            self.calls.append(messages)
            return json.dumps(
                {
                    key: [{"text": "Offline evidence", "page": 2}] * (3 if key == "methods" else 1)
                    for key in SECTIONS
                }
            )

        self.service.chat = chat

    async def test_no_calls_before_consent_cache_and_runtime_target(self):
        self.fixture()
        root = self.root + "/overview"
        self.assertIsNone((await self.client.get(root)).json()["result"])
        payload = await self.payload(consent=False)
        self.assertEqual((await self.client.post(root, json=payload)).status_code, 409)
        self.assertEqual(self.calls, [])
        response = await self.client.post(root, json={**payload, "consent": True, "remember": True})
        self.assertIn('"type": "done"', response.text)
        cached = (await self.client.get(root)).json()
        self.assertTrue(cached["result"]["sections"]["results"][0]["trusted"])
        self.assertEqual(cached["consent_target"], payload["target"])
        await self.client.get(root)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.service.conversations.load(self.item)["messages"], [])
        self.bridge.value["llm_model"] = "new-fixture-model"
        self.assertEqual((await self.client.post(root, json=payload)).status_code, 409)
        self.service.allowed = False
        self.assertEqual((await self.client.post(root, json=payload)).status_code, 403)

    async def test_cancel_never_persists_partial_json(self):
        self.fixture()
        released = threading.Event()

        def chat(config, messages, delta=None, control=None):
            control.add_cancel_callback(released.set)
            delta('{"motivation":')
            released.wait(2)
            control.raise_if_stopped()

        self.service.chat = chat
        prepared, complete = self.app.state.reader_overview.prepare(self.item, await self.payload())
        stream = self.service.stream(self.item, prepared, complete=complete)
        self.assertIn("delta", next(stream))
        stream.close()
        self.assertTrue(released.is_set())
        self.assertIsNone(self.app.state.reader_overview.load(self.item)["result"])
