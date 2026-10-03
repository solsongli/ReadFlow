"""Canvas entities, node-level incremental saves and durable annotation snapshots."""
import json
import shutil
from .data_layout import CANVAS_IMAGES
from . import canvas_model as model
from .store import StoreError, new_id, now, text

SCHEMA = '''
CREATE TABLE IF NOT EXISTS canvases(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, group_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS canvas_nodes(
 id TEXT PRIMARY KEY, canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
 annotation_id TEXT REFERENCES annotations(id) ON DELETE SET NULL,
 item_id TEXT REFERENCES items(id) ON DELETE SET NULL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS canvas_nodes_annotation ON canvas_nodes(annotation_id);
CREATE INDEX IF NOT EXISTS canvas_nodes_canvas ON canvas_nodes(canvas_id);
CREATE TABLE IF NOT EXISTS canvas_assets(
 name TEXT PRIMARY KEY, canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS canvas_edges(
 id TEXT PRIMARY KEY, canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
 from_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
 to_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE, data TEXT NOT NULL
);
'''


class Canvases:
    def __init__(self, store):
        self.store = store
        with store.lock:
            store.db.executescript(SCHEMA)
        self.root = store.data_root / CANVAS_IMAGES
        if self.root.is_symlink():
            raise StoreError('UNSAFE_DATA_ROOT', '画布图片目录不能是符号链接。')
        self.root.mkdir(mode=0o700, exist_ok=True)

    def list(self):
        with self.store.lock:
            return [dict(row) for row in self.store.db.execute('SELECT * FROM canvases ORDER BY created_at,id')]

    def get(self, identity):
        with self.store.lock:
            result = dict(self.store._row('canvases', identity))
            nodes = []
            for row in self.store.db.execute(
                'SELECT n.*,a.color AS live_color,a.quote AS live_quote,a.page_index AS live_page '
                'FROM canvas_nodes n LEFT JOIN annotations a ON n.annotation_id=a.id WHERE n.canvas_id=?',
                (identity,)
            ):
                value = json.loads(row['data'])
                value.update(annotation_id=row['annotation_id'], item_id=row['item_id'])
                if row['live_page'] is not None:
                    value.update(color=row['live_color'], quote=row['live_quote'], page=row['live_page'] + 1)
                nodes.append(value)
            result['nodes'] = nodes
            result['edges'] = [json.loads(row['data']) for row in self.store.db.execute(
                'SELECT data FROM canvas_edges WHERE canvas_id=?', (identity,))]
        return result

    def create(self, data):
        name = text(data.get('name'), 'name', 200, required=True)
        group = data.get('group_id') or None
        with self.store.transaction():
            if group:
                self.store._row('collections', group)
            identity, timestamp = new_id(), now()
            self.store.db.execute('INSERT INTO canvases VALUES(?,?,?,?,?)', (identity, name, group, timestamp, timestamp))
        return self.get(identity)

    def patch(self, identity, data):
        created_images, removed_images = [], []
        citekeys = {}
        try:
            with self.store.transaction():
                self.store._row('canvases', identity)
                if 'name' in data:
                    self.store.db.execute('UPDATE canvases SET name=? WHERE id=?',
                                          (text(data['name'], 'name', 200, required=True), identity))
                if 'group_id' in data:
                    group = data['group_id'] or None
                    if group:
                        self.store._row('collections', group)
                    self.store.db.execute('UPDATE canvases SET group_id=? WHERE id=?', (group, identity))
                for field in ('nodes', 'edges', 'delete_nodes', 'delete_edges'):
                    if not isinstance(data.get(field, []), list) or len(data.get(field, [])) > 2000:
                        raise StoreError('INVALID_CANVAS', '一次最多修改 2000 个画布元素。')
                for key in data.get('delete_edges', []):
                    self.store.db.execute('DELETE FROM canvas_edges WHERE id=? AND canvas_id=?', (model.identity(key), identity))
                for key in data.get('delete_nodes', []):
                    existing = self.store.db.execute('SELECT data FROM canvas_nodes WHERE id=? AND canvas_id=?',
                                                     (model.identity(key), identity)).fetchone()
                    if existing:
                        removed_images.append(json.loads(existing['data']).get('image_ref', ''))
                    self.store.db.execute('DELETE FROM canvas_nodes WHERE id=? AND canvas_id=?', (key, identity))
                for value in data.get('nodes', []):
                    node = self.prepare_node(identity, value, created_images, citekeys)
                    self.store.db.execute(
                        'INSERT INTO canvas_nodes VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET '
                        'annotation_id=excluded.annotation_id,item_id=excluded.item_id,data=excluded.data',
                        (node['id'], identity, node['annotation_id'], node['item_id'], json.dumps(node)))
                for value in data.get('edges', []):
                    connection = model.edge(value)
                    self.check_owner('canvas_edges', connection['id'], identity)
                    for key in ('from_id', 'to_id'):
                        target = self.store._row('canvas_nodes', connection[key])
                        if target['canvas_id'] != identity:
                            raise StoreError('INVALID_CANVAS', '连线只能连接同一画布的元素。')
                    self.store.db.execute('INSERT INTO canvas_edges VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET '
                                          'from_id=excluded.from_id,to_id=excluded.to_id,data=excluded.data',
                                          (connection['id'], identity, connection['from_id'], connection['to_id'], json.dumps(connection)))
                self.store.db.execute('UPDATE canvases SET updated_at=? WHERE id=?', (now(), identity))
        except Exception:
            self.cleanup(created_images)
            raise
        # Canvas-owned assets survive node deletion for undo, and are collected with the canvas.
        return self.get(identity)

    def check_owner(self, table, identity, canvas_id):
        row = self.store.db.execute(f'SELECT * FROM {table} WHERE id=?', (identity,)).fetchone()
        if row and row['canvas_id'] != canvas_id:
            raise StoreError('INVALID_CANVAS', '元素属于另一张画布。')
        return row

    def prepare_node(self, canvas_id, value, created_images, citekeys):
        node = model.node(value)
        previous = self.check_owner('canvas_nodes', node['id'], canvas_id)
        old = json.loads(previous['data']) if previous else {}
        # Source identity is immutable; text, geometry and size use last-write-wins.
        if previous:
            node.update({key: old.get(key) for key in
                         ('quote', 'title', 'authors', 'year', 'venue', 'citekey', 'color', 'page', 'image_ref', 'orphaned')})
            node['annotation_id'], node['item_id'] = previous['annotation_id'], previous['item_id']
            return node
        if node['annotation_id']:
            annotation = self.store.annotations.get(node['annotation_id'])
            node.update(item_id=annotation['item_id'], quote=annotation['quote'], color=annotation['color'],
                        page=annotation['page_index'] + 1, text=node['text'] or annotation['note'])
            if annotation['image_ref']:
                node['type'] = 'image'
                filename = new_id() + '.png'
                created_images.append(filename)
                shutil.copyfile(self.store.annotations.image_path(annotation['id']), self.root / filename)
                node['image_ref'] = filename
                self.store.db.execute('INSERT INTO canvas_assets VALUES(?,?)', (filename, canvas_id))
        elif value.get('orphaned'):
            # Static snapshots recreated by undo may retain text, not arbitrary filesystem refs.
            node.update(quote=text(value.get('quote', ''), 'quote', 100000), orphaned=True,
                        page=int(model.number(value.get('page', 1), 1, 100000)))
        image = value.get('image_ref')
        if not node.get('image_ref') and image and self.store.db.execute(
            'SELECT 1 FROM canvas_assets WHERE name=? AND canvas_id=?', (image, canvas_id)
        ).fetchone():
            node['image_ref'] = image
        if node['item_id']:
            item = self.store.get_item(node['item_id'])
            node.update(title=item['title'], authors=item['authors'], year=item['date'],
                        venue=text(value.get('venue', ''), 'venue', 500), citekey=text(value.get('citekey', ''), 'citekey', 100))
            from .workbench_model import assign_citekeys, base_citekey, year_of, venue_from_source
            state = self.store.db.execute('SELECT venue,citekey FROM item_state WHERE item_id=?', (node['item_id'],)).fetchone()
            node['year'] = year_of(item['date'])
            source = self.store.db.execute(
                "SELECT raw_source_json FROM source_links WHERE entity_type='item' AND entity_id=? ORDER BY source_id LIMIT 1",
                (node['item_id'],)
            ).fetchone()
            try:
                raw = json.loads(source['raw_source_json']) if source else None
            except ValueError:
                raw = None
            node['venue'] = state['venue'] if state and state['venue'] else venue_from_source(
                raw, doi=item['doi'], url=item['url'])
            if not citekeys:
                pinned = {row['item_id']: row['citekey'] for row in self.store.db.execute(
                    "SELECT item_id,citekey FROM item_state WHERE citekey<>''")}
                papers = self.store.db.execute('SELECT id,authors_json,date,title FROM items ORDER BY created_at,id').fetchall()
                citekeys.update(assign_citekeys(
                    ((row['id'], base_citekey(json.loads(row['authors_json']), row['date'], row['title'])) for row in papers),
                    pinned))
            node['citekey'] = citekeys[node['item_id']]
        return node

    def references(self, *, annotation_id=None, item_id=None):
        field, value = ('annotation_id', annotation_id) if annotation_id else ('item_id', item_id)
        with self.store.lock:
            return [dict(row) for row in self.store.db.execute(
                'SELECT n.id AS node_id,n.canvas_id,n.annotation_id,c.name FROM canvas_nodes n '
                f'JOIN canvases c ON c.id=n.canvas_id WHERE n.{field}=? AND n.annotation_id IS NOT NULL', (value,))]

    def detach(self, annotation_id, policy):
        references = self.references(annotation_id=annotation_id)
        if references and policy not in ('keep', 'remove'):
            raise StoreError('CANVAS_REFERENCES', f'该批注在 {len({r["canvas_id"] for r in references})} 个画布中被引用。', 409)
        images = []
        for reference in references:
            row = self.store._row('canvas_nodes', reference['node_id'])
            node = json.loads(row['data'])
            source = self.store.annotations.get(annotation_id)
            node.update(color=source['color'], quote=source['quote'], page=source['page_index'] + 1)
            if policy == 'remove':
                # Retain assets for canvas undo; deletion of the canvas collects them.
                self.store.db.execute('DELETE FROM canvas_nodes WHERE id=?', (row['id'],))
            else:
                node.update(annotation_id=None, orphaned=True)
                self.store.db.execute('UPDATE canvas_nodes SET annotation_id=NULL,data=? WHERE id=?',
                                      (json.dumps(node), row['id']))
        return images

    def cleanup(self, images):
        import re
        for name in images:
            if name and re.fullmatch(r'[a-f0-9-]+\.png', name):
                (self.root / name).unlink(missing_ok=True)

    def remove(self, identity):
        self.get(identity)
        with self.store.transaction():
            images = [row[0] for row in self.store.db.execute('SELECT name FROM canvas_assets WHERE canvas_id=?', (identity,))]
            self.store.db.execute('DELETE FROM canvases WHERE id=?', (identity,))
        self.cleanup(images)
