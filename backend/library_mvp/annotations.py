"""Single source of truth for ReadFlow annotations and region image lifecycle."""
import base64
import binascii
import json
import re
import struct

from .data_layout import ANNOTATION_IMAGES
from .annotation_model import validate, note_view
from .annotation_migration import migrate
from .store import StoreError, new_id, now

SCHEMA = '''
CREATE TABLE IF NOT EXISTS annotations (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 attachment_id TEXT REFERENCES attachments(id), page_index INTEGER NOT NULL,
 type TEXT NOT NULL, color TEXT NOT NULL, rects TEXT NOT NULL, quote TEXT NOT NULL,
 note TEXT NOT NULL, ink TEXT NOT NULL, width INTEGER NOT NULL, image_ref TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, source_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS annotations_item_page ON annotations(item_id,page_index);
CREATE TABLE IF NOT EXISTS annotation_imports(source_id TEXT PRIMARY KEY, imported_at TEXT NOT NULL);
CREATE VIEW IF NOT EXISTS effective_notes AS
 SELECT id,item_id,attachment_id,page_idx,quote,translated_quote,body,created_at,updated_at,raw_source_json
 FROM notes WHERE NOT (quote<>'' OR translated_quote<>'' OR page_idx IS NOT NULL)
 UNION ALL
 SELECT id,item_id,attachment_id,page_index,quote,'',note,created_at,updated_at,
 json_object('readflow_annotation',json_object('color',color)) FROM annotations;

'''


class Annotations:
    def __init__(self, store):
        self.store = store
        with store.lock:
            store.db.executescript(SCHEMA)
        self.root = store.data_root / ANNOTATION_IMAGES
        if self.root.is_symlink():
            raise StoreError('UNSAFE_DATA_ROOT', '批注图片目录不能是符号链接。')
        self.root.mkdir(mode=0o700, exist_ok=True)
        self.migrate()

    def migrate(self):
        migrate(self.store)

    @staticmethod
    def decode(row):
        result = dict(row)
        result['rects'] = json.loads(result['rects'])
        result['ink'] = json.loads(result['ink'])
        return result

    def get(self, identity):
        with self.store.lock:
            row = self.store.db.execute('SELECT * FROM annotations WHERE id=?', (identity,)).fetchone()
        if not row:
            raise StoreError('NOT_FOUND', '批注不存在。', 404)
        return self.decode(row)

    def list(self, item_id=None):
        self.migrate()
        with self.store.lock:
            sql = 'SELECT * FROM annotations'
            args = ()
            if item_id:
                self.store._row('items', item_id)
                sql += ' WHERE item_id=?'
                args = (item_id,)
            return [self.decode(row) for row in self.store.db.execute(sql + ' ORDER BY page_index,created_at', args)]

    def image_path(self, identity):
        row = self.get(identity)
        name = row['image_ref']
        if not re.fullmatch(r'[a-f0-9-]+\.png', name):
            raise StoreError('NOT_FOUND', '区域截图不存在。', 404)
        path = self.root / name
        if path.is_symlink() or not path.is_file():
            raise StoreError('NOT_FOUND', '区域截图不存在。', 404)
        return path

    def save(self, item_id, data, identity=None):
        if not isinstance(data, dict):
            raise StoreError('INVALID_ANNOTATION', '批注必须是对象。')
        old = self.get(identity) if identity else None
        if old and old['item_id'] != item_id:
            raise StoreError('NOT_FOUND', '批注不存在。', 404)
        if old:
            data = {**old, **data}
        origin = old['source_id'] if old else None
        if not old and data.get('source_id') and data.get('id') == data['source_id']:
            with self.store.lock:
                legacy = self.store.db.execute(
                    'SELECT n.id FROM notes n JOIN annotation_imports m ON n.id=m.source_id '
                    'WHERE n.id=? AND n.item_id=?', (data['source_id'], item_id)
                ).fetchone()
            if legacy:
                origin = legacy['id']
        if origin and not data.get('attachment_id'):
            # Unpositioned imported notes remain editable and can be restored by undo.
            attachment = {'id': None, 'item_id': item_id, 'page_count': data.get('page_index', 0) + 1}
        else:
            attachment = self.store.get_attachment(data.get('attachment_id', ''))
        if attachment['item_id'] != item_id:
            raise StoreError('ANNOTATION_SCOPE_MISMATCH', '附件不属于这篇文献。')
        value = validate(data, attachment, migrated=bool(origin))
        identity = identity or data.get('id') or new_id()
        if not isinstance(identity, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,120}', identity):
            raise StoreError('INVALID_ANNOTATION', '批注标识无效。')
        if not old:
            with self.store.lock:
                existing = self.store.db.execute('SELECT * FROM annotations WHERE id=?', (identity,)).fetchone()
            if existing:
                previous = self.decode(existing)
                if previous['item_id'] == item_id and all(previous[key] == value[key] for key in value):
                    return previous
                raise StoreError('ANNOTATION_CONFLICT', '批注标识已存在。', 409)
        image = data.get('image')
        image_name = old['image_ref'] if old else ''
        created_path = None
        if image:
            if value['type'] != 'region' or not isinstance(image, str) or len(image) > 8_000_000:
                raise StoreError('INVALID_ANNOTATION_IMAGE', '截图必须是 PNG，最大 6MB。')
            try:
                payload = base64.b64decode(image.removeprefix('data:image/png;base64,'), validate=True)
                if len(payload) < 24 or not payload.startswith(b'\x89PNG\r\n\x1a\n'):
                    raise ValueError('invalid header')
                width, height = struct.unpack('>II', payload[16:24])
                if not width or not height or width * height > 16_000_000:
                    raise ValueError('image too large')
                import pymupdf
                pixmap = pymupdf.Pixmap(payload)
                if not payload.startswith(b'\x89PNG\r\n\x1a\n') or pixmap.width * pixmap.height > 16_000_000:
                    raise ValueError('invalid image')
            except (ValueError, RuntimeError, binascii.Error):
                raise StoreError('INVALID_ANNOTATION_IMAGE', '截图不是有效 PNG。')
            image_name = new_id() + '.png'
            created_path = self.root / image_name
            with created_path.open('xb') as stream:
                stream.write(payload)
        if value['type'] == 'region' and not image_name:
            raise StoreError('INVALID_ANNOTATION_IMAGE', '区域批注需要截图。')
        timestamp = now()
        result = {
            **value, 'id': identity, 'item_id': item_id, 'image_ref': image_name,
            'created_at': old['created_at'] if old else timestamp, 'updated_at': timestamp,
            'source_id': origin,
        }
        try:
            with self.store.transaction():
                if not old and self.store.db.execute('SELECT 1 FROM annotations WHERE id=?', (identity,)).fetchone():
                    raise StoreError('ANNOTATION_CONFLICT', '批注标识已存在。', 409)
                record = {**result, 'rects': json.dumps(value['rects']), 'ink': json.dumps(value['ink'])}
                if old:
                    fields = [key for key in record if key != 'id']
                    self.store.db.execute(
                        'UPDATE annotations SET ' + ','.join(key + '=?' for key in fields) + ' WHERE id=?',
                        [*[record[key] for key in fields], identity]
                    )
                else:
                    fields = list(record)
                    self.store.db.execute(
                        'INSERT INTO annotations (' + ','.join(fields) + ') VALUES (' +
                        ','.join('?' for _ in fields) + ')', [record[key] for key in fields]
                    )
        except Exception:
            if created_path:
                created_path.unlink(missing_ok=True)
            raise
        if old and old['image_ref'] and old['image_ref'] != image_name:
            (self.root / old['image_ref']).unlink(missing_ok=True)
        return result

    def remove(self, identity, canvas_policy="") :
        row = self.get(identity)
        images = []
        with self.store.transaction():
            if hasattr(self.store, 'canvases'):
                images = self.store.canvases.detach(identity, canvas_policy)
            if hasattr(self.store, 'flashcards'):
                self.store.flashcards.detach(identity, canvas_policy)
            self.store.db.execute('DELETE FROM annotations WHERE id=?', (identity,))
        if images:
            self.store.canvases.cleanup(images)
        if row['image_ref']:
            (self.root / row['image_ref']).unlink(missing_ok=True)

    def notes(self):
        return [note_view(row) for row in self.list()]
