from fastapi import Request
from fastapi.responses import Response
from .flashcards import Flashcards


def register_flashcard_routes(app, store, json_body):
    service = store.flashcards = Flashcards(store)
    root = '/api/research/workbench'

    @app.get(root + '/decks')
    def decks():
        return {'items': service.decks()}

    @app.post(root + '/decks', status_code=201)
    async def create_deck(request: Request):
        return service.deck(await json_body(request))

    @app.patch(root + '/decks/{identity}')
    async def patch_deck(identity: str, request: Request):
        return service.deck(await json_body(request), identity)

    @app.delete(root + '/decks/{identity}', status_code=204)
    def delete_deck(identity: str):
        service.remove('decks', identity)
        return Response(status_code=204)

    @app.get(root + '/flashcards')
    def cards(item_id: str = ''):
        return {'items': service.list(item_id)}

    @app.get(root + '/card-reviews')
    def reviews(day: str):
        return {'items': service.reviews(day)}

    @app.post(root + '/flashcards', status_code=201)
    async def create_card(request: Request):
        return service.save(await json_body(request))

    @app.patch(root + '/flashcards/{identity}')
    async def patch_card(identity: str, request: Request):
        return service.save(await json_body(request), identity)

    @app.delete(root + '/flashcards/{identity}', status_code=204)
    def delete_card(identity: str):
        service.remove('flashcards', identity)
        return Response(status_code=204)

    @app.post(root + '/flashcards/{identity}/review')
    async def review(identity: str, request: Request):
        return service.review(identity, await json_body(request))
