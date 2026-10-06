"""ReadFlow flashcards. Sources remain snapshots when an annotation is detached."""
import json
import re
import unicodedata
from .store import StoreError, new_id, now, text
from .flashcard_schedule import schedule

SCHEMA = '''
CREATE TABLE IF NOT EXISTS decks (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 group_id TEXT REFERENCES collections(id) ON DELETE SET NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS flashcards (
 id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 annotation_id TEXT REFERENCES annotations(id) ON DELETE SET NULL,
 data TEXT NOT NULL, suspended INTEGER NOT NULL DEFAULT 0,
 due TEXT NOT NULL, interval INTEGER NOT NULL DEFAULT 0,
 repetitions INTEGER NOT NULL DEFAULT 0, ease REAL NOT NULL DEFAULT 2.5,
 version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS flashcards_term_unique
 ON flashcards(item_id, json_extract(data, '$.term_key'))
 WHERE json_extract(data, '$.term_key') IS NOT NULL;
CREATE INDEX IF NOT EXISTS flashcards_annotation ON flashcards(annotation_id);
CREATE TABLE IF NOT EXISTS card_reviews (
 id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
 day TEXT NOT NULL, rating INTEGER NOT NULL, previous TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS card_reviews_day ON card_reviews(day);
'''


class Flashcards:
    def __init__(self, store):
        self.store = store
        with store.lock:
            store.db.executescript(SCHEMA)

    def decks(self):
        with self.store.lock:
            return [dict(row) for row in self.store.db.execute('SELECT * FROM decks ORDER BY created_at,id')]

    def deck(self, data, identity=None):
        name = text(data.get('name'), 'name', 200, required=True)
        group = data.get('group_id') or None
        with self.store.transaction():
            if group:
                self.store._row('collections', group)
            if identity:
                self.store._row('decks', identity)
                self.store.db.execute('UPDATE decks SET name=?,group_id=? WHERE id=?', (name, group, identity))
            else:
                identity = new_id()
                self.store.db.execute('INSERT INTO decks VALUES(?,?,?,?)', (identity, name, group, now()))
        return next(row for row in self.decks() if row['id'] == identity)

    def list(self, item_id=''):
        with self.store.lock:
            rows = self.store.db.execute('SELECT f.*,i.title AS item_title FROM flashcards f '
                'JOIN items i ON i.id=f.item_id LEFT JOIN item_state s ON s.item_id=i.id '
                'WHERE s.deleted_at IS NULL AND (?="" OR f.item_id=?) '
                'ORDER BY f.created_at,f.id', (item_id, item_id)).fetchall()
        return [{**json.loads(row['data']), **{key: row[key] for key in row.keys() if key != 'data'}} for row in rows]

    def get(self, identity):
        with self.store.lock:
            row = dict(self.store._row('flashcards', identity))
        return {**json.loads(row.pop('data')), **row}

    def save(self, data, identity=None):
        previous = self.get(identity) if identity else {}
        value = {**previous, **data}
        kind = value.get('kind', 'question')
        if kind not in ('question', 'cloze', 'term'):
            raise StoreError('INVALID_CARD', '未知卡型。')
        content = {key: text(value.get(key, ''), key, limit) for key, limit in
                   [('front', 10000), ('back', 100000), ('quote', 100000), ('translation', 100000),
                    ('explanation', 100000), ('tags', 2000)]}
        if not content['front'].strip():
            raise StoreError('INVALID_CARD', '请填写卡片正面。')
        page = value.get('page', 1)
        if type(page) is not int or not 1 <= page <= 100000:
            raise StoreError('INVALID_CARD', '页码无效。')
        annotation = value.get('annotation_id') or None
        item = value.get('item_id')
        if identity and item != previous['item_id']:
            raise StoreError('INVALID_CARD', '不能把已有闪卡移动到其他文献。')
        deck = value.get('deck_id')
        content.update(kind=kind, page=page, orphaned=bool(previous.get('orphaned')))
        with self.store.transaction():
            self.store._row('items', item)
            self.store._row('decks', deck)
            if annotation:
                source = self.store._row('annotations', annotation)
                if source['item_id'] != item:
                    raise StoreError('INVALID_CARD', '批注与文献不一致。')
                content.update(quote=content['quote'] or source['quote'], page=source['page_index'] + 1)
            if kind == 'term':
                key = previous.get('term_key') or term_key(content['front'])
                content['term_key'] = key
                if not identity:
                    for row in self.store.db.execute('SELECT id,data FROM flashcards WHERE item_id=?', (item,)):
                        old = json.loads(row['data'])
                        if old.get('kind') == 'term' and (old.get('term_key') or term_key(old.get('front', ''))) == key:
                            return {**self.get(row['id']), 'duplicate': True}
            timestamp = now()
            if identity:
                self.store.db.execute('UPDATE flashcards SET deck_id=?,annotation_id=?,data=?,suspended=?, '
                    'updated_at=?,version=version+1 WHERE id=?',
                    (deck, annotation, json.dumps(content), int(bool(value.get('suspended'))), timestamp, identity))
            else:
                identity = new_id()
                self.store.db.execute('INSERT INTO flashcards '
                    '(id,deck_id,item_id,annotation_id,data,due,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
                    (identity, deck, item, annotation, json.dumps(content), '0001-01-01', timestamp, timestamp))
        return self.get(identity)

    def remove(self, table, identity):
        if table not in ('flashcards', 'decks'):
            raise StoreError('INVALID_CARD', '无效类型。')
        with self.store.transaction():
            self.store._row(table, identity)
            self.store.db.execute(f'DELETE FROM {table} WHERE id=?', (identity,))

    def review(self, identity, data):
        with self.store.transaction():
            current = self.get(identity)
            if current['suspended']:
                raise StoreError('CARD_SUSPENDED', '此卡已暂停，请恢复后复习。', 409)
            if data.get('version') != current['version']:
                raise StoreError('STALE_CARD', '此卡已更新，请刷新后继续。', 409)
            result = schedule(current, data.get('rating'), data.get('day'))
            self.store.db.execute('INSERT INTO card_reviews VALUES(?,?,?,?,?,?)',
                (new_id(), identity, data['day'], data['rating'], json.dumps(current), now()))
            self.store.db.execute('UPDATE flashcards SET due=?,interval=?,repetitions=?,ease=?, '
                'version=version+1,updated_at=? WHERE id=?',
                (result['due'], result['interval'], result['repetitions'], result['ease'], now(), identity))
        return self.get(identity)

    def reviews(self, day):
        with self.store.lock:
            return [dict(row) for row in self.store.db.execute(
                'SELECT card_id,rating,previous FROM card_reviews WHERE day=?', (day,))]

    def detach(self, annotation, policy):
        rows = self.store.db.execute('SELECT id,data FROM flashcards WHERE annotation_id=?', (annotation,)).fetchall()
        if rows and policy not in ('keep', 'remove'):
            raise StoreError('CARD_REFERENCED', f'有 {len(rows)} 张闪卡引用了它，请选择保留或一并删除。', 409)
        for row in rows:
            if policy == 'remove':
                self.store.db.execute('DELETE FROM flashcards WHERE id=?', (row['id'],))
            else:
                value = json.loads(row['data'])
                value['orphaned'] = True
                self.store.db.execute('UPDATE flashcards SET annotation_id=NULL,data=? WHERE id=?',
                                      (json.dumps(value), row['id']))


def term_key(value):
    value = unicodedata.normalize('NFKC', value).strip().casefold()
    return re.sub(r'\s+', ' ', re.sub(r'[‐‑–—-]', ' ', value))
