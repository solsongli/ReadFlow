"""Zotero-style library tags: colored tags with 1–9 shortcuts, batch apply, rename and delete."""
import json
from fastapi import Request
from .store import StoreError, text

SCHEMA = '''
CREATE TABLE IF NOT EXISTS tag_colors(
 name TEXT PRIMARY KEY, color INTEGER NOT NULL CHECK(color BETWEEN 1 AND 7),
 position INTEGER NOT NULL UNIQUE CHECK(position BETWEEN 1 AND 9)
);
'''
MAX_COLORED = 9


def tag_name(value):
    return text(value, 'tag', 200, required=True)


def tag_list(value, field):
    if not isinstance(value, list) or len(value) > 100:
        raise StoreError('INVALID_FIELD', f'{field} must be a list of at most 100 tags.')
    return list(dict.fromkeys(tag_name(entry) for entry in value))


class TagCatalog:
    def __init__(self, store):
        self.store = store
        with store.lock:
            store.db.executescript(SCHEMA)

    def colors(self):
        with self.store.lock:
            return [dict(row) for row in self.store.db.execute('SELECT * FROM tag_colors ORDER BY position')]

    def set_color(self, name, data):
        name = tag_name(name)
        color = data.get('color')
        if not isinstance(color, int) or not 1 <= color <= 7:
            raise StoreError('INVALID_FIELD', 'color must be an integer from 1 to 7.')
        with self.store.transaction():
            rows = {row['name']: (row['color'], row['position'])
                    for row in self.store.db.execute('SELECT * FROM tag_colors')}
            current = rows.get(name)
            position = data.get('position', current[1] if current else None)
            if position is None:
                used = {slot for _, slot in rows.values()}
                position = next((slot for slot in range(1, MAX_COLORED + 1) if slot not in used), None)
                if position is None:
                    raise StoreError('TOO_MANY_COLORED_TAGS', f'最多可以为 {MAX_COLORED} 个标签指定颜色。', 409)
            if not isinstance(position, int) or not 1 <= position <= MAX_COLORED:
                raise StoreError('INVALID_FIELD', 'position must be an integer from 1 to 9.')
            owner = next((tag for tag, (_, slot) in rows.items() if slot == position and tag != name), None)
            target = None
            if owner is not None:
                # The displaced tag takes the mover's old slot (a swap) or else the first free slot.
                used = {slot for tag, (_, slot) in rows.items() if tag not in (name, owner)} | {position}
                target = current[1] if current else next(
                    (slot for slot in range(1, MAX_COLORED + 1) if slot not in used), None)
                if target is None:
                    raise StoreError('TOO_MANY_COLORED_TAGS', f'最多可以为 {MAX_COLORED} 个标签指定颜色。', 409)
            self.store.db.execute('DELETE FROM tag_colors WHERE name IN (?,?)', (name, owner or name))
            self.store.db.execute('INSERT INTO tag_colors(name,color,position) VALUES(?,?,?)', (name, color, position))
            if owner is not None:
                self.store.db.execute('INSERT INTO tag_colors(name,color,position) VALUES(?,?,?)',
                                      (owner, rows[owner][0], target))
        return self.colors()

    def clear_color(self, name):
        with self.store.transaction():
            self.store.db.execute('DELETE FROM tag_colors WHERE name=?', (tag_name(name),))
        return self.colors()

    def _retag(self, rows, change):
        """Apply change(tags) -> tags to the given item rows inside the caller's transaction."""
        updated = 0
        for row in rows:
            before = json.loads(row['tags_json'])
            after = change(before)
            if after != before:
                self.store._write_item(row['id'], self.store._metadata({'tags': after}, partial=True))
                updated += 1
        return updated

    def apply(self, data):
        ids = data.get('item_ids')
        if not isinstance(ids, list) or not ids or len(ids) > 5000 or len(set(ids)) != len(ids):
            raise StoreError('INVALID_FIELD', 'item_ids must be a non-empty list of distinct ids.')
        add, remove = tag_list(data.get('add', []), 'add'), tag_list(data.get('remove', []), 'remove')
        with self.store.transaction():
            rows = [self.store._row('items', text(identity, 'item_ids', 64, required=True)) for identity in ids]
            updated = self._retag(rows, lambda tags: [t for t in tags if t not in remove] +
                                  [t for t in add if t not in tags])
        return {'updated': updated}

    def rename(self, data):
        old, new = tag_name(data.get('from')), tag_name(data.get('to'))
        with self.store.transaction():
            rows = self.store.db.execute(
                'SELECT id,tags_json FROM items WHERE EXISTS (SELECT 1 FROM json_each(items.tags_json) WHERE value=?)',
                (old,)).fetchall()
            updated = self._retag(rows, lambda tags: list(dict.fromkeys(new if t == old else t for t in tags)))
            if old != new and not self.store.db.execute('SELECT 1 FROM tag_colors WHERE name=?', (new,)).fetchone():
                self.store.db.execute('UPDATE tag_colors SET name=? WHERE name=?', (new, old))
            else:
                self.store.db.execute('DELETE FROM tag_colors WHERE name=? AND ?<>?', (old, old, new))
        return {'updated': updated, 'colors': self.colors()}

    def delete(self, data):
        name = tag_name(data.get('name'))
        with self.store.transaction():
            rows = self.store.db.execute(
                'SELECT id,tags_json FROM items WHERE EXISTS (SELECT 1 FROM json_each(items.tags_json) WHERE value=?)',
                (name,)).fetchall()
            updated = self._retag(rows, lambda tags: [t for t in tags if t != name])
            self.store.db.execute('DELETE FROM tag_colors WHERE name=?', (name,))
        return {'updated': updated, 'colors': self.colors()}


def register_tag_routes(app, store, json_body):
    service = store.tag_catalog = TagCatalog(store)
    root = '/api/research/workbench/tags'

    @app.get(root + '/colors')
    def colors():
        return {'items': service.colors()}

    @app.put(root + '/colors/{name}')
    async def set_color(name: str, request: Request):
        return {'items': service.set_color(name, await json_body(request))}

    @app.delete(root + '/colors/{name}')
    def clear_color(name: str):
        return {'items': service.clear_color(name)}

    @app.post(root + '/apply')
    async def apply(request: Request):
        return service.apply(await json_body(request))

    @app.post(root + '/rename')
    async def rename(request: Request):
        return service.rename(await json_body(request))

    @app.post(root + '/delete')
    async def delete(request: Request):
        return service.delete(await json_body(request))

