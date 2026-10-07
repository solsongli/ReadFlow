"""Desk to-dos: a short ordered list, optionally linked to one library item."""
from datetime import date
from .store import StoreError, new_id, now, text

SCHEMA = '''
CREATE TABLE IF NOT EXISTS todos(
 id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
 position REAL NOT NULL, due TEXT, item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, done_at TEXT
);
CREATE INDEX IF NOT EXISTS todos_order ON todos(done, position);
'''
LIMIT = 2000


def due_date(value):
    if value in (None, ''):
        return None
    try:
        return date.fromisoformat(text(value, 'due', 10)).isoformat()
    except ValueError:
        raise StoreError('INVALID_FIELD', 'due must be a YYYY-MM-DD date.') from None


class Todos:
    def __init__(self, store):
        self.store = store
        with store.lock:
            store.db.executescript(SCHEMA)

    def list(self):
        with self.store.lock:
            rows = self.store.db.execute(
                'SELECT t.*,i.title AS item_title FROM todos t LEFT JOIN items i ON t.item_id=i.id '
                'ORDER BY t.done, CASE WHEN t.done THEN t.done_at END DESC, t.position, t.created_at')
            return [self._public(row) for row in rows]

    def get(self, identity):
        return next(row for row in self.list() if row['id'] == identity)

    def _public(self, row):
        value = dict(row)
        value['done'] = bool(value['done'])
        return value

    def _item(self, value):
        if value in (None, ''):
            return None
        self.store._row('items', text(value, 'item_id', 64, required=True))
        return value

    def create(self, data):
        title = text(data.get('title'), 'title', 500, required=True)
        with self.store.transaction():
            if self.store.db.execute('SELECT COUNT(*) FROM todos').fetchone()[0] >= LIMIT:
                raise StoreError('TOO_MANY_TODOS', f'待办最多保留 {LIMIT} 项，请先清除已完成。', 409)
            item = self._item(data.get('item_id'))
            last = self.store.db.execute('SELECT MAX(position) FROM todos WHERE done=0').fetchone()[0]
            identity, timestamp = new_id(), now()
            self.store.db.execute(
                'INSERT INTO todos VALUES(?,?,0,?,?,?,?,?,NULL)',
                (identity, title, (last or 0) + 1, due_date(data.get('due')), item, timestamp, timestamp))
        return self.get(identity)

    def patch(self, identity, data):
        with self.store.transaction():
            row = self.store._row('todos', identity)
            changes = {}
            if 'title' in data:
                changes['title'] = text(data['title'], 'title', 500, required=True)
            if 'due' in data:
                changes['due'] = due_date(data['due'])
            if 'item_id' in data:
                changes['item_id'] = self._item(data['item_id'])
            if 'done' in data:
                if not isinstance(data['done'], bool):
                    raise StoreError('INVALID_FIELD', 'done must be a boolean.')
                if data['done'] != bool(row['done']):
                    changes['done'] = int(data['done'])
                    changes['done_at'] = now() if data['done'] else None
                    if not data['done']:
                        last = self.store.db.execute('SELECT MAX(position) FROM todos WHERE done=0').fetchone()[0]
                        changes['position'] = (last or 0) + 1
            if changes:
                changes['updated_at'] = now()
                # Column names come from the fixed keys above, never from the request.
                assignments = ','.join(f'{name}=?' for name in changes)
                self.store.db.execute(f'UPDATE todos SET {assignments} WHERE id=?', (*changes.values(), identity))
        return self.get(identity)

    def reorder(self, data):
        ids = data.get('ids')
        if not isinstance(ids, list) or len(ids) > LIMIT or len(set(ids)) != len(ids):
            raise StoreError('INVALID_FIELD', 'ids must be a list of distinct to-do ids.')
        with self.store.transaction():
            for position, identity in enumerate(ids, 1):
                self.store._row('todos', text(identity, 'ids', 64, required=True))
                self.store.db.execute('UPDATE todos SET position=? WHERE id=?', (position, identity))
        return self.list()

    def remove(self, identity):
        with self.store.transaction():
            self.store._row('todos', identity)
            self.store.db.execute('DELETE FROM todos WHERE id=?', (identity,))

    def clear_done(self):
        with self.store.transaction():
            removed = self.store.db.execute('DELETE FROM todos WHERE done=1').rowcount
        return {'removed': removed}
