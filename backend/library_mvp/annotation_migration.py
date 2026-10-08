"""One-time import of legacy note records; original notes remain untouched."""
import json
from .store import now
from .annotation_model import COLORS

LEGACY_PREDICATE = "(quote<>'' OR translated_quote<>'' OR page_idx IS NOT NULL)"


def migrate(store):
    with store.transaction():
        rows = store.db.execute(
            'SELECT * FROM notes WHERE ' + LEGACY_PREDICATE +
            ' AND id NOT IN (SELECT source_id FROM annotation_imports)'
        ).fetchall()
        for row in rows:
            try:
                raw = json.loads(row['raw_source_json'] or '{}')
            except ValueError:
                raw = {}
            native = next((value for value in raw.values() if isinstance(value, dict) and
                           'selection' in value), {}) if isinstance(raw, dict) else {}
            # Legacy viewport rectangles do not include a reliable page size. Retain content
            # and page without inventing normalized geometry; users can locate it by quote.
            rects = native.get('rects', []) if native.get('coordinateSpace') == 'normalized' else []
            color = native.get('color', 'yellow')
            if color not in COLORS:
                color = 'yellow'
            identity = row['id']
            store.db.execute(
                'INSERT OR IGNORE INTO annotations '
                '(id,item_id,attachment_id,page_index,type,color,rects,quote,note,tags,ink,width,'
                'image_ref,created_at,updated_at,source_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (identity, row['item_id'], row['attachment_id'], row['page_idx'] or 0,
                 'highlight', color, json.dumps(rects), row['quote'] or row['translated_quote'],
                 row['body'], '[]', '[]', 2, '', row['created_at'], row['updated_at'], row['id'])
            )
            store.db.execute('INSERT INTO annotation_imports VALUES(?,?)', (row['id'], now()))
