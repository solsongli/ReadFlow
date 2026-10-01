"""Workbench read model and state API. Synthetic metadata only; no network or model calls."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest

import httpx

from backend.library_mvp.api import create_app
from backend.library_mvp.workbench_model import (assign_citekeys, base_citekey, matches_query, short_venue,
                                                 source_kind, valid_citekey, venue_from_source, year_of)

ROOT = "/api/research/workbench"


class ModelTests(unittest.TestCase):
    def test_citekeys_follow_author_year_title(self):
        self.assertEqual(base_citekey(["Borong Zhang", "Yuhao Zhang"], "2025-03-05",
                                      "SafeVLA: Towards Safety Alignment of Vision-Language-Action Model"), "zhang2025safevla")
        self.assertEqual(base_citekey(["Kevin Black"], "2024", "π0: A Vision-Language-Action Flow Model"), "black2024pi0")
        self.assertEqual(base_citekey(["Brohan, Anthony"], "2023-07-28", "RT-2: Vision-Language-Action Models"), "brohan2023rt2")
        self.assertEqual(base_citekey(["José Núñez"], "2019", "The Art of Learning"), "nunez2019art")
        self.assertEqual(base_citekey([], "", "Towards the On"), "anon")

    def test_citekey_collisions_get_suffixes_and_pins_win(self):
        keys = assign_citekeys([("a", "li2024x"), ("b", "li2024x"), ("c", "li2024x"), ("d", "kim2024y")], {"d": "li2024x"})
        self.assertEqual(keys, {"d": "li2024x", "a": "li2024xa", "b": "li2024xb", "c": "li2024xc"})
        self.assertTrue(valid_citekey("zhang2025safevla"))
        self.assertTrue(valid_citekey("custom:key-1.v2"))
        self.assertFalse(valid_citekey("has space"))
        self.assertFalse(valid_citekey(""))

    def test_venues_come_from_stored_source_records(self):
        connector = {"item": {"itemType": "preprint", "repository": "arXiv"}, "capture_context": {}}
        zotero = {"data": {"proceedingsTitle": "Conference on Robot Learning (CoRL)"}}
        csl = {"container-title": ["Nature Machine Intelligence"], "container-title-short": "Nat. Mach. Intell."}
        self.assertEqual(venue_from_source(connector), "arXiv")
        self.assertEqual(venue_from_source(zotero), "Conference on Robot Learning (CoRL)")
        self.assertEqual(short_venue("Conference on Robot Learning (CoRL)", zotero), "CoRL")
        self.assertEqual(venue_from_source(csl), "Nature Machine Intelligence")
        self.assertEqual(short_venue("Nature Machine Intelligence", csl), "Nat. Mach. Intell.")
        self.assertEqual(venue_from_source(None, doi="10.48550/arXiv.2503.03480"), "arXiv")
        self.assertEqual(venue_from_source(None), "")
        self.assertEqual(year_of("v4 revised 2026-04-19"), "2026")
        self.assertEqual(year_of("no year"), "")

    def test_source_kinds_and_search(self):
        self.assertEqual(source_kind(""), "pdf")
        self.assertEqual(source_kind("zotero-connector:session"), "connector")
        self.assertEqual(source_kind("csl-json:file"), "csl-json")
        row = {"title": "OpenVLA", "title_translated": "开源模型", "doi": "", "venue": "CoRL", "citekey": "kim2024openvla",
               "year": "2024", "authors": ["Moo Jin Kim"], "tags": ["方法"]}
        for needle in ("openvla", "开源", "corl", "KIM", "方法", "2024"):
            self.assertTrue(matches_query(row, needle), needle)
        self.assertFalse(matches_query(row, "diffusion"))


class WorkbenchApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="retain-workbench-test-")
        self.app = create_app(Path(self.temporary.name))
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://localhost")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.app.state.store.close()
        self.temporary.cleanup()

    async def ok(self, method: str, path: str, **kwargs) -> dict:
        response = await self.client.request(method, path, **kwargs)
        self.assertLess(response.status_code, 300, response.text)
        return response.json()

    async def item(self, title: str, **fields) -> str:
        return (await self.ok("POST", "/api/research/items", json={"title": title, **fields}))["id"]

    async def group(self, name: str, parent_id: str | None = None) -> str:
        return (await self.ok("POST", "/api/research/collections", json={"name": name, "parent_id": parent_id}))["id"]

    async def rows(self, **params) -> dict:
        return await self.ok("GET", ROOT + "/items", params=params)

    async def test_one_paper_can_join_several_groups_and_parents_count_children(self):
        safe = await self.item("SafeVLA: Towards Safety Alignment", authors=["Borong Zhang"], date="2025-03-05",
                               doi="10.48550/arXiv.2503.03480")
        open_vla = await self.item("OpenVLA: An Open-Source Vision-Language-Action Model", authors=["Moo Jin Kim"], date="2024")
        loose = await self.item("Loose synthetic paper")
        vla = await self.group("具身智能 · VLA")
        safety = await self.group("安全对齐", vla)
        thesis = await self.group("毕业论文")
        await self.ok("POST", f"{ROOT}/groups/{safety}/items", json={"add": [safe]})
        await self.ok("POST", f"{ROOT}/groups/{thesis}/items", json={"add": [safe, open_vla]})
        await self.ok("POST", f"{ROOT}/groups/{vla}/items", json={"add": [open_vla, open_vla]})

        result = await self.rows()
        rows = {row["id"]: row for row in result["items"]}
        self.assertEqual(rows[safe]["group_ids"], sorted([safety, thesis]))
        self.assertEqual(rows[safe]["citekey"], "zhang2025safevla")
        self.assertEqual(rows[safe]["venue"], "arXiv")
        counts = {group["id"]: (group["count"], group["direct_count"]) for group in result["groups"]}
        self.assertEqual(counts[vla], (2, 1))
        self.assertEqual(counts[safety], (1, 1))
        self.assertEqual(counts[thesis], (2, 2))
        self.assertEqual(result["counts"]["unfiled"], 1)
        self.assertEqual(result["counts"]["all"], 3)

        self.assertEqual({row["id"] for row in (await self.rows(group_id=vla))["items"]}, {safe, open_vla})
        self.assertEqual([row["id"] for row in (await self.rows(group_id=vla, include_children="false"))["items"]], [open_vla])
        self.assertEqual([row["id"] for row in (await self.rows(view="unfiled"))["items"]], [loose])

        await self.ok("POST", f"{ROOT}/groups/{thesis}/items", json={"remove": [safe]})
        self.assertEqual((await self.ok("GET", f"{ROOT}/items/{safe}"))["group_ids"], [safety])

        deleted = await self.ok("POST", f"{ROOT}/groups/{vla}/delete", json={})
        self.assertEqual(deleted["deleted"], 2)
        after = await self.rows()
        self.assertEqual(after["counts"]["all"], 3, "deleting groups never deletes papers")
        self.assertEqual({group["id"] for group in after["groups"]}, {thesis})
        self.assertEqual((await self.ok("GET", f"{ROOT}/items/{open_vla}"))["group_ids"], [thesis])

    async def test_state_search_sort_trash_and_desk(self):
        old = await self.item("Constrained Policy Optimization", authors=["Joshua Achiam"], date="2017")
        new = await self.item("Diffusion Policy", authors=["Cheng Chi"], date="2023", doi="10.1/dp")
        row = await self.ok("PATCH", f"{ROOT}/items/{old}/state", json={"title_translated": "约束策略优化", "starred": True})
        self.assertEqual((row["title_translated"], row["starred"], row["read_status"]), ("约束策略优化", True, "unread"))

        self.assertEqual([entry["id"] for entry in (await self.rows(query="约束"))["items"]], [old])
        self.assertEqual([entry["id"] for entry in (await self.rows(view="starred"))["items"]], [old])
        self.assertEqual([entry["id"] for entry in (await self.rows(sort="year", order="asc"))["items"]], [old, new])
        self.assertEqual([entry["id"] for entry in (await self.rows(year_from="2020"))["items"]], [new])

        opened = await self.ok("POST", f"{ROOT}/items/{new}/opened", json={"page": 3, "pages": 12})
        self.assertEqual((opened["read_status"], opened["read_page"], opened["read_pages"]), ("reading", 3, 12))
        reread = await self.ok("PATCH", f"{ROOT}/items/{new}/state", json={"read_status": "read"})
        self.assertEqual(reread["read_status"], "read")
        self.assertEqual((await self.ok("POST", f"{ROOT}/items/{new}/opened", json={}))["read_status"], "read")

        note = {"quote": "Constraint satisfaction during learning", "body": "核心"}
        await self.ok("POST", f"/api/research/items/{old}/notes", json=note)
        await self.ok("POST", f"/api/research/items/{old}/notes", json={"body": "standalone reading note"})
        since = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        desk = await self.ok("GET", ROOT + "/desk", params={"since": since})
        self.assertEqual([entry["id"] for entry in desk["continue_reading"]], [new])
        self.assertEqual([entry["id"] for entry in desk["to_read"]], [old])
        self.assertEqual(desk["recent_annotations"][0]["item_title"], "Constrained Policy Optimization")
        self.assertEqual(desk["recent_notes"][0]["body"], "standalone reading note")
        self.assertEqual(desk["attention"]["missing_doi"], [old])
        self.assertEqual(desk["attention"]["untranslated_titles"], [new])
        self.assertEqual(desk["today"], {"opened": 1, "annotations": 1, "notes": 1})

        await self.ok("POST", ROOT + "/items/trash", json={"item_ids": [old]})
        trashed = await self.rows()
        self.assertEqual(([entry["id"] for entry in trashed["items"]], trashed["counts"]["trash"]), ([new], 1))
        self.assertEqual([entry["id"] for entry in (await self.rows(view="trash"))["items"]], [old])
        self.assertEqual((await self.ok("GET", ROOT + "/desk"))["recent_annotations"], [])
        await self.ok("POST", ROOT + "/items/restore", json={"item_ids": [old]})
        self.assertEqual((await self.rows())["counts"], {"all": 2, "unread": 1, "starred": 1, "unfiled": 2, "recent": 1, "trash": 0})

    async def test_citekey_pins_are_unique_and_inputs_are_validated(self):
        first = await self.item("Alpha", authors=["Ada Li"], date="2024")
        second = await self.item("Alpha", authors=["Ada Li"], date="2024")
        keys = [row["citekey"] for row in (await self.rows(sort="added", order="asc"))["items"]]
        self.assertEqual(keys, ["li2024alpha", "li2024alphaa"])
        pinned = await self.ok("PATCH", f"{ROOT}/items/{second}/state", json={"citekey": "li2024chosen"})
        self.assertEqual((pinned["citekey"], pinned["citekey_pinned"]), ("li2024chosen", True))
        clash = await self.client.patch(f"{ROOT}/items/{first}/state", json={"citekey": "li2024chosen"})
        self.assertEqual(clash.status_code, 409)

        bad = [("GET", ROOT + "/items", {"params": {"view": "bogus"}}),
               ("GET", ROOT + "/items", {"params": {"sort": "bogus"}}),
               ("GET", ROOT + "/items", {"params": {"group_id": "missing"}}),
               ("PATCH", f"{ROOT}/items/{first}/state", {"json": {}}),
               ("PATCH", f"{ROOT}/items/{first}/state", {"json": {"read_status": "skimmed"}}),
               ("PATCH", f"{ROOT}/items/{first}/state", {"json": {"starred": "yes"}}),
               ("PATCH", f"{ROOT}/items/{first}/state", {"json": {"citekey": "has space"}}),
               ("POST", f"{ROOT}/items/{first}/opened", {"json": {"page": -1}}),
               ("POST", ROOT + "/items/trash", {"json": {"item_ids": "all"}}),
               ("POST", f"{ROOT}/groups/missing/items", {"json": {"add": [first]}}),
               ("POST", f"{ROOT}/groups/missing/delete", {"json": {}}),
               ("PATCH", f"{ROOT}/items/missing/state", {"json": {"starred": True}})]
        for method, path, kwargs in bad:
            response = await self.client.request(method, path, **kwargs)
            self.assertIn(response.status_code, (400, 404, 409), f"{method} {path} {kwargs}: {response.text}")
            self.assertIn("error", response.json())


class TranslationStatusTests(unittest.TestCase):
    def test_job_history_summaries(self):
        from backend.library_mvp.workbench_translation import summarize_jobs
        done = {"job_id": "j1", "workflow": "book", "status": "succeeded", "output_pdf_ready": True,
                "stages": {"translation": {"state": "completed"}}}
        running = {"job_id": "j2", "workflow": "book", "status": "running",
                   "stages": {"translation": {"state": "in_progress", "progress": {"percent": 62.4}}}}
        ocr_only = {"job_id": "j3", "workflow": "ocr", "status": "succeeded", "stages": {"translation": {"state": "skipped"}}}
        skipped = {"job_id": "j4", "workflow": "book", "status": "succeeded", "stages": {"translation": {"state": "skipped"}}}
        self.assertEqual(summarize_jobs([]), {"status": "none", "job_id": None, "percent": None})
        self.assertEqual(summarize_jobs([done])["status"], "done")
        self.assertEqual(summarize_jobs([running, done]), {"status": "running", "job_id": "j2", "percent": 62})
        self.assertEqual(summarize_jobs([ocr_only, done])["job_id"], "j1", "OCR-only runs are skipped")
        self.assertEqual(summarize_jobs([skipped])["status"], "none")
        self.assertEqual(summarize_jobs([{"job_id": "q", "status": "queued"}])["status"], "queued")
        self.assertEqual(summarize_jobs([{"job_id": "f", "status": "failed"}, done])["status"], "failed")
        self.assertEqual(summarize_jobs(["junk", None, done])["status"], "done")

    def test_lookups_are_cached_and_failures_degrade(self):
        from backend.library_mvp.workbench_translation import TranslationStatus
        calls, now = [], [0.0]

        def fetch(digest):
            calls.append(digest)
            if digest == "bad":
                raise RuntimeError("service down")
            return [{"job_id": "j", "status": "succeeded", "stages": {"translation": {"state": "completed"}}}]

        status = TranslationStatus(fetch, ttl=10, clock=lambda: now[0])
        try:
            first = status.states(["a", "bad", "a"])
            self.assertEqual((first["a"]["status"], first["bad"]["status"]), ("done", "unknown"))
            status.states(["a"])
            self.assertEqual(sorted(calls), ["a", "bad"], "second call within TTL is served from cache")
            now[0] = 11
            status.states(["a"])
            self.assertEqual(calls.count("a"), 2)
        finally:
            status.close()

    def test_rows_carry_document_id_and_translation(self):
        from backend.library_mvp.tests.test_store import synthetic_pdf
        from backend.library_mvp.workbench import Workbench
        from backend.library_mvp.store import Store
        with tempfile.TemporaryDirectory(prefix="retain-workbench-translation-") as root:
            store = Store(Path(root))
            try:
                added = store.add_pdf(synthetic_pdf(["Translated synthetic page"]), filename="t.pdf")
                digest = added["attachment"]["sha256"]
                seen = []
                bench = Workbench(store, lambda digests: seen.extend(digests) or {digest: {"status": "done", "job_id": "j", "percent": 100}})
                row = bench.list()["items"][0]
                self.assertEqual((row["document_id"], row["translation"]["status"]), (digest, "done"))
                self.assertEqual(seen, [digest])
                self.assertEqual(Workbench(store).list()["items"][0]["translation"], {"status": "none"})
            finally:
                store.close()


if __name__ == "__main__":
    unittest.main()
