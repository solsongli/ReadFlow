from fastapi import Request
from fastapi.responses import Response
from .todos import Todos


def register_todo_routes(app, store, json_body):
    service = store.todos = Todos(store)
    root = '/api/research/workbench/todos'

    @app.get(root)
    def listing():
        return {'items': service.list()}

    @app.post(root, status_code=201)
    async def create(request: Request):
        return service.create(await json_body(request))

    @app.post(root + '/reorder')
    async def reorder(request: Request):
        return {'items': service.reorder(await json_body(request))}

    @app.post(root + '/clear-done')
    def clear_done():
        return service.clear_done()

    @app.patch(root + '/{identity}')
    async def update(identity: str, request: Request):
        return service.patch(identity, await json_body(request))

    @app.delete(root + '/{identity}', status_code=204)
    def delete(identity: str):
        service.remove(identity)
        return Response(status_code=204)
