"""Offline reader translation/chat contracts; never contacts a real model."""
import contextlib
import io
import json
import tempfile
from pathlib import Path
import unittest
import httpx
import pymupdf
from backend.library_mvp.api import create_app
from backend.library_mvp.reader_assistance_transport import run_chat


class FakeBridge:
    def __init__(self):
        self.value = {'llm_base_url': 'http://127.0.0.1:9/v1', 'llm_model': 'fixture',
                      'llm_api_key': 'fixture-private-value', 'configured_runtime': 'python'}
        self.offline = False
    def reader_runtime_config(self):
        if self.offline:
            raise OSError('offline')
        return self.value
    def reader_glossary(self, identity):
        return {'entries': [{'source': 'method', 'target': '方法'}]}
    def document_jobs(self, *args):
        return []
    def cached(self, attachment):
        return {}
    def close(self):
        pass


class ReaderAssistanceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.bridge = FakeBridge()
        self.app = create_app(Path(self.temp.name), bridge=self.bridge, allow_external_models=True)
        self.store = self.app.state.store
        self.service = self.app.state.reader_assistance
        with pymupdf.open() as pdf:
            pdf.new_page().insert_text((50, 50), 'Synthetic private page text')
            pdf.new_page()
            item = self.store.add_pdf(pdf.tobytes(), filename='reader.pdf')['item']
        self.item = item['id']
        self.root = f'/api/research/workbench/items/{self.item}/assistance'
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://localhost')
        self.calls = []
        def chat(config, messages, delta=None, **kwargs):
            self.calls.append((config, messages))
            if delta:
                delta('这是假回答 ')
                delta('(p. 2)')
            return '这是假回答 (p. 2)' if delta else '【译】Synthetic source'
        self.service.chat = chat

    async def asyncTearDown(self):
        await self.client.aclose()
        self.store.close()
        self.temp.cleanup()

    async def payload(self, **patch):
        result = (await self.client.get('/api/research/workbench/assistance/status')).json()
        return {'question': 'Explain the method', 'page': 1, 'page_text': 'Synthetic private page text',
                'selection': 'Synthetic source', 'target': result['target'], 'consent': True, **patch}

    async def test_preflight_status_never_invokes_model_and_does_not_expose_credentials(self):
        response = await self.client.get('/api/research/workbench/assistance/status')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('fixture-private-value', response.text)
        self.assertEqual(self.calls, [])
        self.bridge.offline = True
        response = await self.client.get('/api/research/workbench/assistance/status')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['error']['code'], 'ai_offline')
        self.bridge.offline = False
        self.bridge.value = []
        response = await self.client.get('/api/research/workbench/assistance/status')
        self.assertEqual(response.json()['error']['code'], 'ai_config_error')

    async def test_translation_uses_supplied_configuration_and_enabled_glossary(self):
        config = {'base_url': 'http://127.0.0.1:9/v1', 'model': 'translation-fixture',
                  'api_key': 'fixture-private-value', 'glossary_id': 'glossary'}
        response = await self.client.post(self.root + '/translate', json={'text': 'Synthetic source', 'translation': config})
        self.assertEqual(response.status_code, 200)
        self.assertIn('【译】', response.json()['text'])
        self.assertEqual(self.calls[0][0]['model'], 'translation-fixture')
        self.assertIn('方法', self.calls[0][1][0]['content'])
        response = await self.client.post(self.root + '/translate', json={'text': 'source', 'translation': {}})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(self.calls), 1)

    async def test_gate_and_consent_prevent_calls(self):
        payload = await self.payload(consent=False)
        response = await self.client.post(self.root + '/ask', json=payload)
        self.assertEqual(response.status_code, 409)
        self.service.allowed = False
        response = await self.client.post(self.root + '/ask', json={**payload, 'consent': True})
        self.assertEqual(response.status_code, 403)
        response = await self.client.post(self.root + '/translate', json={'text': 'source', 'translation': {}})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.calls, [])

    async def test_stream_history_context_clear_and_changed_target(self):
        payload = await self.payload(remember=True)
        response = await self.client.post(self.root + '/ask', json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertIn('"type": "delta"', response.text)
        self.assertIn('(p. 2)', response.text)
        session = (await self.client.get(self.root + '/conversation')).json()
        self.assertEqual(len(session['messages']), 2)
        self.assertEqual(session['consent_target'], payload['target'])
        self.assertIn('Synthetic private page text', self.calls[0][1][0]['content'])
        response = await self.client.post(self.root + '/ask', json={**payload, 'consent': False})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(any(message['role'] == 'assistant' for message in self.calls[1][1]))
        self.bridge.value['llm_model'] = 'changed-model'
        response = await self.client.post(self.root + '/ask', json=payload)
        self.assertEqual(response.status_code, 409)
        cleared = (await self.client.delete(self.root + '/conversation')).json()
        self.assertEqual(cleared['messages'], [])
        self.assertEqual(cleared['consent_target'], '')
        # An in-flight answer from the old generation cannot resurrect cleared history.
        self.service.conversations.append(self.item, 0, 'old', 'old', 1)
        self.assertEqual(self.service.conversations.load(self.item)['messages'], [])

    async def test_errors_and_logs_do_not_contain_source_or_credentials(self):
        def broken(*args, **kwargs):
            raise RuntimeError('401 Synthetic private page text fixture-private-value')
        self.service.chat = broken
        import logging
        output = io.StringIO()
        logger = logging.getLogger()
        handler = logging.StreamHandler(output)
        previous = logger.level
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)
        try:
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                response = await self.client.post(self.root + '/ask', json=await self.payload())
        finally:
            logger.removeHandler(handler)
            logger.setLevel(previous)
        for forbidden in ('Synthetic private page text', 'fixture-private-value'):
            self.assertNotIn(forbidden, response.text)
            self.assertNotIn(forbidden, output.getvalue())
        self.assertIn('credentials', response.text)

    async def test_runtime_transport_is_streaming_and_sends_no_tools(self):
        requests = []
        def respond(request):
            requests.append(json.loads(request.content))
            chunks = [
                {'choices': [{'delta': {'content': 'fixture-private-'}, 'finish_reason': None}]},
                {'choices': [{'delta': {'content': 'value answer (p. 2)'}, 'finish_reason': None}]},
                {'choices': [{'delta': {}, 'finish_reason': 'stop'}]},
            ]
            return httpx.Response(200, text=''.join('data: ' + json.dumps(c) + '\n\n' for c in chunks) + 'data: [DONE]\n\n')
        parts = []
        answer = run_chat({'base_url': 'http://127.0.0.1:9/v1', 'model': 'fixture', 'api_key': 'fixture-private-value'},
                          [{'role': 'user', 'content': 'Synthetic question'}], parts.append,
                          transport=httpx.MockTransport(respond))
        self.assertTrue(requests[0]['stream'])
        self.assertNotIn('tools', requests[0])
        self.assertNotIn('fixture-private-value', answer)
        self.assertNotIn('fixture-private-value', ''.join(parts))

    async def test_disconnect_cancels_worker_and_does_not_persist_partial_answer(self):
        import threading
        released = threading.Event()
        def waiting(config, messages, delta=None, control=None):
            control.add_cancel_callback(released.set)
            delta('Partial fixture answer')
            released.wait(timeout=2)
            control.raise_if_stopped()
            return 'Unexpected complete answer'
        self.service.chat = waiting
        prepared = self.service.prepare(self.item, await self.payload())
        stream = self.service.stream(self.item, prepared)
        self.assertIn('delta', next(stream))
        stream.close()
        self.assertTrue(released.is_set())
        self.assertTrue(self.service.close())
        self.assertEqual(self.service.conversations.load(self.item)['messages'], [])

    async def test_credentials_split_across_stream_chunks_never_reach_output(self):
        secret = 'fixture-private-value'
        def respond(request):
            pieces = ['A' * 90 + secret[:10], secret[10:] + ' end']
            chunks = [{'choices': [{'delta': {'content': piece}, 'finish_reason': None}]} for piece in pieces]
            chunks.append({'choices': [{'delta': {}, 'finish_reason': 'stop'}]})
            return httpx.Response(200, text=''.join('data: ' + json.dumps(c) + '\n\n' for c in chunks) + 'data: [DONE]\n\n')
        parts = []
        result = run_chat({'base_url': 'http://127.0.0.1:9/v1', 'model': 'fixture', 'api_key': secret},
                          [{'role': 'user', 'content': 'fixture'}], parts.append, transport=httpx.MockTransport(respond))
        self.assertNotIn(secret, ''.join(parts))
        self.assertEqual(''.join(parts), result)

    async def test_conversation_and_remembered_scope_survive_store_reopen(self):
        from backend.library_mvp.store import Store
        from backend.library_mvp.reader_assistance_store import ReaderConversations
        response = await self.client.post(self.root + '/ask', json=await self.payload(remember=True))
        self.assertEqual(response.status_code, 200)
        self.service.close()
        self.store.close()
        self.store = Store(Path(self.temp.name))
        saved = ReaderConversations(self.store).load(self.item)
        self.assertEqual(len(saved['messages']), 2)
        self.assertTrue(saved['consent_target'])
