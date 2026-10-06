"""Term cards are idempotent across decks, requests and edits."""
import json
import tempfile
from pathlib import Path
import unittest
from backend.library_mvp.store import Store
from backend.library_mvp.annotations import Annotations
from backend.library_mvp.flashcards import Flashcards


class TermCardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name))
        from backend.library_mvp.workbench import Workbench

        Workbench(self.store)
        Annotations(self.store)
        self.cards = Flashcards(self.store)
        self.item = self.store.create_item({"title": "Term fixture"})["id"]
        self.deck = self.cards.deck({"name": "Terms"})["id"]

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_deduplication_is_per_item_not_per_deck_and_keeps_original_card(self):
        body = {
            "item_id": self.item,
            "deck_id": self.deck,
            "kind": "term",
            "front": "Vision–Language Model",
            "back": "视觉语言模型",
            "page": 2,
            "quote": "A model predicts actions.",
        }
        first = self.cards.save(body)
        other = self.cards.deck({"name": "Other"})["id"]
        again = self.cards.save(
            {**body, "deck_id": other, "front": "vision-language model", "back": "changed"}
        )
        self.assertTrue(again["duplicate"])
        self.assertEqual(again["id"], first["id"])
        self.assertEqual(again["deck_id"], self.deck)
        self.assertEqual(again["back"], first["back"])
        self.cards.save({"front": "Edited title"}, first["id"])
        self.assertEqual(self.cards.save(body)["id"], first["id"])
        self.assertEqual(len(self.cards.list()), 1)
        self.cards.remove("flashcards", first["id"])
        self.assertNotEqual(self.cards.save(body)["id"], first["id"])

    def test_legacy_term_card_without_key_is_reused(self):
        body = {"item_id": self.item, "deck_id": self.deck, "kind": "term", "front": "Policy"}
        first = self.cards.save(body)
        content = json.loads(
            self.store.db.execute("SELECT data FROM flashcards WHERE id=?", (first["id"],)).fetchone()[0]
        )
        content.pop("term_key")
        with self.store.transaction():
            self.store.db.execute(
                "UPDATE flashcards SET data=? WHERE id=?", (json.dumps(content), first["id"])
            )
        self.assertEqual(self.cards.save({**body, "front": "POLICY"})["id"], first["id"])
