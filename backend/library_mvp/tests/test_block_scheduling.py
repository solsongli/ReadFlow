"""Stable priority, token-aware batches and incremental cache/progress publication."""
import json
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from backend.library_mvp.paper_blocks_batches import planned_batches, prioritize_pages
from backend.library_mvp.paper_blocks_translate import translate_blocks


def rows(count=100):
    return [
        {
            "id": str(i),
            "type": "text",
            "text": "Evidence and findings. " * 30,
            "protected": [],
            "page": i // 10 + 1,
        }
        for i in range(count)
    ]


class BlockSchedulingTests(unittest.TestCase):
    def test_budget_and_two_waves_with_no_dropped_or_duplicate_blocks(self):
        for concurrency in (1, 4, 8, 16):
            blocks = rows()
            groups = planned_batches(blocks, concurrency)
            self.assertGreaterEqual(len(groups), concurrency * 2)
            self.assertEqual([b["id"] for group in groups for b in group], [b["id"] for b in blocks])
        self.assertEqual(planned_batches([], 8), [])
        self.assertEqual(len(planned_batches(rows(3), 8)), 3)

    def test_current_and_next_two_pages_first_remaining_in_document_order(self):
        blocks = rows()
        ordered = prioritize_pages(blocks, 5)
        self.assertEqual([b["id"] for b in ordered[:30]], [str(i) for i in range(40, 70)])
        self.assertEqual([b["id"] for b in ordered[30:]], [str(i) for i in [*range(40), *range(70, 100)]])
        self.assertEqual(prioritize_pages(blocks, None), blocks)
        blocks[0]["anchors"] = [{"page": 1}, {"page": 5}]
        self.assertEqual(prioritize_pages(blocks, 5)[0]["id"], "0")

    def test_first_batch_is_saved_while_others_run_and_cached_blocks_count_once(self):
        cache, writes, progress = {}, [], []
        release, first = threading.Event(), threading.Event()

        def call(messages):
            group = json.loads(messages[-1]["content"])["blocks"]
            if group[0]["id"] != "0":
                release.wait(3)
            return json.dumps({"blocks": [{"id": b["id"], "text": "【译】" + b["text"]} for b in group]})

        def save(delta):
            writes.append(delta)
            first.set()

        with ThreadPoolExecutor(max_workers=1) as pool:
            work = pool.submit(
                translate_blocks,
                rows(8),
                cache,
                "zh-CN",
                "fixture",
                call,
                [],
                lambda: None,
                lambda done, total: progress.append((done, total)),
                save,
                concurrency=4,
            )
            self.assertTrue(first.wait(2))
            self.assertFalse(work.done())
            release.set()
            self.assertEqual(work.result(3), [])
        self.assertEqual(len(cache), 8)
        self.assertEqual(sum(len(w) for w in writes), 8)
        self.assertEqual(progress[-1], (8, 8))
        self.assertEqual(progress, sorted(progress))
        translate_blocks(
            rows(8),
            cache,
            "zh-CN",
            "fixture",
            lambda _: self.fail("Cache must be reused"),
            [],
            lambda: None,
            lambda done, total: self.assertEqual((done, total), (8, 8)),
            save,
        )
