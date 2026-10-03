from fastapi import Request
from fastapi.responses import FileResponse, Response
from .canvases import Canvases
from .canvas_model import outline
from .store import StoreError


def register_canvas_routes(app, store, json_body):
    service = store.canvases = Canvases(store)
    root = '/api/research/workbench/canvases'

    @app.get(root)
    def listing():
        return {'items': service.list()}

    @app.post(root, status_code=201)
    async def create(request: Request):
        return service.create(await json_body(request))

    @app.get(root + '/references')
    def references(item_id: str = '', annotation_id: str = ''):
        return {'items': service.references(item_id=item_id, annotation_id=annotation_id)}

    @app.get(root + '/{identity}')
    def read(identity: str):
        return service.get(identity)

    @app.patch(root + '/{identity}')
    async def update(identity: str, request: Request):
        return service.patch(identity, await json_body(request))

    @app.delete(root + '/{identity}', status_code=204)
    def delete(identity: str):
        service.remove(identity)
        return Response(status_code=204)

    @app.get(root + '/{identity}/export')
    def export(identity: str):
        return {'markdown': outline(service.get(identity))}

    @app.get(root + '/{identity}/nodes/{node_id}/image')
    def image(identity: str, node_id: str):
        import json
        import re
        with store.lock:
            row = store._row('canvas_nodes', node_id)
        name = json.loads(row['data']).get('image_ref', '')
        if row['canvas_id'] != identity or not re.fullmatch(r'[a-f0-9-]+\.png', name):
            raise StoreError('NOT_FOUND', '画布图片不存在。', 404)
        path = service.root / name
        if path.is_symlink() or not path.is_file():
            raise StoreError('NOT_FOUND', '画布图片不存在。', 404)
        return FileResponse(path, media_type='image/png', headers={'Cache-Control': 'private, no-cache'})
