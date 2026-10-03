"""Reader bookmarks and bounded, idempotent reading-time increments per library item."""
import math
from fastapi import Request
from .store import StoreError, new_id, now


def register_paper_reader(app, store, json_body):
    with store.lock:
        store.db.executescript('''
        CREATE TABLE IF NOT EXISTS reader_bookmarks(id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          page INTEGER NOT NULL, offset REAL NOT NULL DEFAULT 0, name TEXT NOT NULL, created_at TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'source');
        CREATE TABLE IF NOT EXISTS reader_time(item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE, seconds INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS reader_ticks(id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE);
        ''')
        if 'mode' not in {row['name'] for row in store.db.execute('PRAGMA table_info(reader_bookmarks)')}:
            store.db.execute("ALTER TABLE reader_bookmarks ADD COLUMN mode TEXT NOT NULL DEFAULT 'source'")
    root = '/api/research/workbench/items/{item_id}/reader'

    def snapshot(item_id):
        store.get_item(item_id)
        with store.lock:
            bookmarks = [dict(row) for row in store.db.execute('SELECT id,page,offset,name,mode FROM reader_bookmarks WHERE item_id=? ORDER BY page,offset,created_at', (item_id,))]
            time = store.db.execute('SELECT seconds FROM reader_time WHERE item_id=?', (item_id,)).fetchone()
        return {'bookmarks': bookmarks, 'seconds': time[0] if time else 0}

    @app.get(root)
    def read(item_id: str):
        return snapshot(item_id)

    @app.post(root + '/bookmarks')
    async def add(item_id: str, request: Request):
        item = store.get_item(item_id)
        value = await json_body(request)
        page, offset, name = value.get('page'), value.get('offset', 0), value.get('name', '')
        pages = max((a['page_count'] for a in item.get('attachments', [])), default=0)
        mode = value.get('mode', 'source')
        if mode not in {'source', 'translated'} or not pages or type(page) is not int or not 1 <= page <= (2000 if mode == 'translated' else pages) or type(offset) not in (int, float) or not math.isfinite(offset) or not 0 <= offset <= 1 or not isinstance(name, str) or not 1 <= len(name.strip()) <= 200:
            raise StoreError('INVALID_BOOKMARK', '书签页码、位置或名称无效。')
        with store.transaction():
            store.db.execute('INSERT INTO reader_bookmarks(id,item_id,page,offset,name,created_at,mode) VALUES(?,?,?,?,?,?,?)', (new_id(), item_id, page, offset, name.strip(), now(), mode))
        return snapshot(item_id)

    @app.delete(root + '/bookmarks/{bookmark_id}')
    def remove(item_id: str, bookmark_id: str):
        store.get_item(item_id)
        with store.transaction():
            store.db.execute('DELETE FROM reader_bookmarks WHERE id=? AND item_id=?', (bookmark_id, item_id))
        return snapshot(item_id)

    @app.post(root + '/time')
    async def tick(item_id: str, request: Request):
        store.get_item(item_id)
        value = await json_body(request)
        seconds, identity = value.get('seconds'), value.get('id')
        if type(seconds) is not int or not 1 <= seconds <= 60 or not isinstance(identity, str) or not 1 <= len(identity) <= 100:
            raise StoreError('INVALID_READING_TIME', '阅读时长记录无效。')
        with store.transaction():
            inserted = store.db.execute('INSERT OR IGNORE INTO reader_ticks VALUES(?,?)', (identity, item_id)).rowcount
            if inserted:
                store.db.execute('INSERT INTO reader_time VALUES(?,?) ON CONFLICT(item_id) DO UPDATE SET seconds=seconds+excluded.seconds', (item_id, seconds))
        return snapshot(item_id)
