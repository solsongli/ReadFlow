"""Opt-in slow benchmark: READFLOW_BENCHMARK=1 python -m unittest ...test_workbench_performance."""
import os
from pathlib import Path
import statistics
import tempfile
import time
import unittest

import httpx

from backend.library_mvp.api import create_app


@unittest.skipUnless(os.environ.get("READFLOW_BENCHMARK") == "1", "slow: opt-in 2000-item endpoint benchmark")
class WorkbenchPerformanceTests(unittest.IsolatedAsyncioTestCase):
    async def test_2000_item_endpoint(self):
        with tempfile.TemporaryDirectory(prefix="readflow-benchmark-") as directory:
            app = create_app(Path(directory))
            store = app.state.store
            groups = [store.create_collection({"name": f"Synthetic group {i}"}) for i in range(20)]
            try:
                for index in range(2000):
                    item = store.create_item({"title": f"Synthetic research paper {index:04d} — 机器学习与科研阅读", "authors": [f"Author {index % 100}", "Demo Researcher"], "date": str(2020 + index % 6), "tags": ["Synthetic", f"Topic {index % 10}"], "collection_ids": [groups[index % 20]["id"], groups[(index + 1) % 20]["id"]]})
                    store.db.execute("INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?)", (f"pdf-{index}", item["id"], f"{index:064x}", "synthetic.pdf", "application/pdf", 20, "native_text", item["created_at"]))
                    store.create_note(item["id"], {"body": "A synthetic observation."})
                app.state.workbench.translations = lambda digests: {digest: {"status": "none"} for digest in digests}
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
                    timings = []
                    for _ in range(11):
                        start = time.perf_counter()
                        response = await client.get("/api/research/workbench/items")
                        timings.append((time.perf_counter() - start) * 1000)
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(len(response.json()["items"]), 2000)
                    warm = sorted(timings[1:])
                    print(f"READFLOW_BENCH items=2000 attachments=2000 notes=2000 groups=20 memberships=4000 transport=ASGI translations=synthetic_readonly cold_ms={timings[0]:.2f} mean_ms={statistics.mean(warm):.2f} median_ms={statistics.median(warm):.2f} p95_ms={warm[-1]:.2f}")
            finally:
                store.close()
