"""Check shipped Python sidecar twice against synthetic used data; no installed app is touched."""
import argparse
import asyncio
import base64
import importlib.util
import json
import os
from pathlib import Path
import secrets
import selectors
import subprocess
import sys
import tempfile
from urllib.request import Request, urlopen


async def seed(resources, root):
    entry = resources / 'backend/research-library/native_library_service.py'
    spec = importlib.util.spec_from_file_location('packaged_restart_service', entry)
    service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(service)
    import pymupdf
    from library_mvp.agent_config import AgentConfig
    app = service.create_native_app(root, internal_token='a' * 64,
        native_base='http://127.0.0.1:9', api_key='synthetic-restart')
    async with app.router.lifespan_context(app):
        store = app.state.store
        with pymupdf.open() as pdf:
            pdf.new_page().insert_text((40, 40), 'Synthetic existing-data restart')
            imported = store.add_pdf(pdf.tobytes(), filename='restart.pdf')
        pixels = pymupdf.Pixmap(pymupdf.csRGB, (0, 0, 20, 20), False)
        annotation = store.annotations.save(imported['item']['id'], {
            'attachment_id': imported['attachment']['id'], 'page_index': 0, 'type': 'region', 'color': 'yellow',
            'rects': [{'x': .1, 'y': .1, 'width': .2, 'height': .2}],
            'image': base64.b64encode(pixels.tobytes('png')).decode(),
        })
        canvas = store.canvases.create({'name': 'Restart fixture'})
        store.canvases.patch(canvas['id'], {'nodes': [{'id': 'image', 'type': 'image',
            'annotation_id': annotation['id'], 'x': 0, 'y': 0, 'width': 200, 'height': 160}]})
        deck = store.flashcards.deck({'name': 'Restart deck'})
        store.flashcards.save({'item_id': imported['item']['id'], 'annotation_id': annotation['id'],
            'deck_id': deck['id'], 'front': 'Synthetic question', 'back': 'Synthetic answer', 'page': 1})
        (root / 'optional-ocr/fixture').mkdir(parents=True, exist_ok=True)
        (root / 'optional-ocr/fixture/model.bin').write_bytes(b'synthetic fixture, never loaded')
        AgentConfig(root / 'agent-config.json').save({'base_url': 'http://127.0.0.1:9/v1', 'model': 'fixture', 'api_key': ''})


def check(unpacked, home):
    resources = unpacked / 'resources'
    python = resources / 'backend/python/bin/python3'
    data = home / 'profile/chromium/data/research-library'
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(home),
           'XDG_CONFIG_HOME': str(home / '.config'), 'RETAIN_PDF_RESEARCH_CONNECTOR_PORT': '',
           'PYTHONDONTWRITEBYTECODE': '1'}
    subprocess.run([str(python), '-I', '-B', str(Path(__file__).resolve()), str(unpacked),
                    '--seed', str(data)], env=env, check=True)
    token = secrets.token_hex(32)
    env.update(RETAIN_PDF_RESEARCH_INTERNAL_TOKEN=token, RETAIN_PDF_RESEARCH_NATIVE_API_KEY='synthetic-restart')
    results = []
    for number in range(2):
        child = subprocess.Popen([str(python), '-I', '-B',
            str(resources / 'backend/research-library/native_library_service.py'), '--data-root', str(data),
            '--native-base', 'http://127.0.0.1:9', '--port', '0'], env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            with selectors.DefaultSelector() as ready:
                ready.register(child.stdout, selectors.EVENT_READ)
                if not ready.select(25):
                    raise RuntimeError('Packaged sidecar readiness timed out')
            line = child.stdout.readline()
            if not line.startswith('RETAINPDF_RESEARCH_READY='):
                raise RuntimeError('Packaged sidecar did not become ready')
            base = json.loads(line.split('=', 1)[1])['base_url']
            def get(path):
                with urlopen(Request(base + path, headers={'X-RetainPDF-Internal': token}), timeout=5) as response:
                    return json.load(response)
            assert get('/api/research/healthz')['ok']
            assert len(get('/api/research/items')['items']) == 1
            assert len(get('/api/research/workbench/canvases')['items']) == 1
            assert len(get('/api/research/workbench/flashcards')['items']) == 1
            status = get('/api/research/connector/status')
            assert status['status'] == 'disabled' and status['client'] == 'ReadFlow'
            results.append({'run': number + 1, 'health': True, 'persistent_items': 1, 'connector': 'disabled'})
        finally:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
            child.stdout.close()
            child.stderr.close()
    print(json.dumps({'mode': 'packaged-sidecar', 'runs': results, 'isolated_home': str(home)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('unpacked', type=Path)
    parser.add_argument('--seed', type=Path)
    args = parser.parse_args()
    unpacked = args.unpacked.resolve()
    if Path('/opt') in unpacked.parents:
        raise SystemExit('Refusing installed applications under /opt')
    if args.seed and not any(part.name.startswith('readflow-') for part in args.seed.resolve().parents):
        raise SystemExit('Seed mode requires a dedicated readflow-* temporary directory')
    if args.seed:
        asyncio.run(seed(unpacked / 'resources', args.seed.resolve()))
    else:
        with tempfile.TemporaryDirectory(prefix='readflow-packaged-restart-') as tmp:
            check(unpacked, Path(tmp))
