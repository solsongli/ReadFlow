"""Reader conversation history lives in the existing library database, never in credentials."""
import json
from .store import new_id, now, text, StoreError

SCHEMA = '''
CREATE TABLE IF NOT EXISTS reader_conversations(
 item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
 consent_target TEXT NOT NULL DEFAULT '', generation INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reader_messages(
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 role TEXT NOT NULL, body TEXT NOT NULL, page INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reader_messages_item ON reader_messages(item_id,created_at);
'''


class ReaderConversations:
    def __init__(self, store):
        self.store = store
        with store.lock:
            store.db.executescript(SCHEMA)

    def load(self, item):
        self.store.get_item(item)
        with self.store.lock:
            state = self.store.db.execute('SELECT * FROM reader_conversations WHERE item_id=?', (item,)).fetchone()
            messages = [dict(row) for row in self.store.db.execute(
                'SELECT * FROM reader_messages WHERE item_id=? ORDER BY created_at,id', (item,))]
        return {'messages': messages, 'consent_target': state['consent_target'] if state else '',
                'generation': state['generation'] if state else 0}

    def consent(self, item, target, remember):
        with self.store.transaction():
            self.store.db.execute('INSERT OR IGNORE INTO reader_conversations(item_id) VALUES(?)', (item,))
            if remember:
                self.store.db.execute('UPDATE reader_conversations SET consent_target=? WHERE item_id=?', (target, item))

    def append(self, item, generation, question, answer, page):
        with self.store.transaction():
            state = self.store.db.execute('SELECT generation FROM reader_conversations WHERE item_id=?', (item,)).fetchone()
            if not state or state['generation'] != generation:
                return
            for role, body in [('user', question), ('assistant', answer)]:
                self.store.db.execute('INSERT INTO reader_messages VALUES(?,?,?,?,?,?)',
                                      (new_id(), item, role, body, page, now()))

    def clear(self, item):
        self.store.get_item(item)
        with self.store.transaction():
            self.store.db.execute('DELETE FROM reader_messages WHERE item_id=?', (item,))
            self.store.db.execute('INSERT INTO reader_conversations(item_id,generation) VALUES(?,1) '
                                  'ON CONFLICT(item_id) DO UPDATE SET generation=generation+1,consent_target=\'\'', (item,))
        return self.load(item)
