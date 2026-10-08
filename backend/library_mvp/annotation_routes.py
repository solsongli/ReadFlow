"""Annotation CRUD, export, and authenticated region images."""
from fastapi import Request
from fastapi.responses import FileResponse, Response
from .annotation_model import markdown, semantics, SEMANTICS
from .store import StoreError


def register_annotation_routes(app, store, json_body):
    annotations = store.annotations
    root = '/api/research/workbench/items/{item_id}/annotations'

    @app.get(root)
    def listing(item_id: str):
        return {'items': annotations.list(item_id)}

    @app.get('/api/research/workbench/annotation-tags')
    def tags():
        return {'items': annotations.tags()}

    @app.post(root, status_code=201)
    async def create(item_id: str, request: Request):
        return annotations.save(item_id, await json_body(request))

    @app.patch(root + '/{identity}')
    async def update(item_id: str, identity: str, request: Request):
        return annotations.save(item_id, await json_body(request), identity)

    @app.delete(root + '/{identity}', status_code=204)
    def delete(item_id: str, identity: str, canvas_policy: str = "") :
        store.get_item(item_id)
        try:
            row = annotations.get(identity)
        except StoreError as error:
            if error.code == 'NOT_FOUND':
                return Response(status_code=204)
            raise
        if row['item_id'] != item_id:
            raise StoreError('NOT_FOUND', '批注不存在。', 404)
        annotations.remove(identity, canvas_policy)
        return Response(status_code=204)

    @app.post(root + '/export')
    async def export(item_id: str, request: Request):
        data = await json_body(request)
        rows = annotations.list(item_id)
        ids = data.get('ids')
        if ids is not None:
            if not isinstance(ids, list) or any(not isinstance(value, str) for value in ids):
                raise StoreError('INVALID_ANNOTATION', '批注列表无效。')
            rows = [row for row in rows if row['id'] in ids]
        labels = semantics(data['semantics']) if 'semantics' in data else SEMANTICS
        item = store.get_item(item_id)
        citation = item['title']
        citekey = app.state.workbench.row(item_id)['citekey']
        if citekey:
            citation += ' · @' + citekey
        content = markdown(rows, labels, citation)
        if data.get('as_note'):
            return store.create_note(item_id, {'body': content})
        return {'markdown': content}

    @app.get('/api/research/annotations/{identity}/image')
    def image(identity: str):
        return FileResponse(annotations.image_path(identity), media_type='image/png',
                            headers={'Cache-Control': 'private, no-cache'})
