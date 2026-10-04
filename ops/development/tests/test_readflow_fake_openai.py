"""Pure fake-service formatting tests; no socket or model is contacted."""
import unittest
from ops.development.readflow_fake_openai import completion_content
import json


class FakeCompletionTests(unittest.TestCase):
    def test_readflow_block_batch_preserves_ids_and_protected_fragments(self):
        rows = [{'id': 'abc', 'text': 'Method __RF_abc_0__'}, {'id': 'def', 'text': 'Result'}]
        body = {'messages': [{'role': 'user', 'content': json.dumps({'blocks': rows})}]}
        translated = json.loads(completion_content(body))['blocks']
        self.assertEqual(translated, [{'id': r['id'], 'text': '【译】' + r['text']} for r in rows])

    def test_plain_text_echo_has_test_prefix(self):
        body = {'messages': [{'role': 'user', 'content': '【当前原文开始】Hello【当前原文结束】'}]}
        self.assertEqual(completion_content(body), '【译】Hello')

    def test_tagged_batch_retains_item_identity(self):
        body = {'messages': [{'role': 'system', 'content': '<<<ITEM'}, {'role': 'user', 'content': json.dumps({'items': [{'item_id': 'block-a', 'source_text': 'Paper'}]})}]}
        self.assertEqual(completion_content(body), '<<<ITEM item_id=block-a decision=translate>>>\n【译】Paper\n<<<END>>>')

    def test_json_schema_batch_and_domain_have_expected_shapes(self):
        body = {'messages': [{'role': 'user', 'content': json.dumps({'items': [{'item_id': 'a', 'text': 'Body'}]})}],
                'response_format': {'json_schema': {'schema': {'properties': {'translations': {}}}}}}
        self.assertEqual(json.loads(completion_content(body))['translations'][0]['translated_text'], '【译】Body')
        body['response_format']['json_schema']['schema']['properties'] = {'domain': {}}
        self.assertEqual(set(json.loads(completion_content(body))), {'domain', 'summary', 'translation_guidance'})

    def test_json_object_fallback_preserves_valid_json_for_compatible_providers(self):
        body = {'messages': [{'role': 'user', 'content': '【当前原文开始】Hello【当前原文结束】'}], 'response_format': {'type': 'json_object'}}
        self.assertEqual(json.loads(completion_content(body))['translated_text'], '【译】Hello')
        body['messages'][0]['content'] = 'Return domain, summary, translation_guidance'
        self.assertIn('translation_guidance', json.loads(completion_content(body)))

    def test_reader_chat_has_bounded_page_citation_and_no_translation_prefix(self):
        body = {'messages': [{'role': 'system', 'content': 'Cite known pages as (p. N). Context: fixture'},
                             {'role': 'user', 'content': 'Explain'}]}
        result = completion_content(body)
        self.assertIn('这是假回答 (p. 2)', result)
        self.assertNotIn('【译】', result)

    def test_flashcard_suggestion_is_structured_and_bounded(self):
        result = completion_content({'stream': True, 'messages': [
            {'role': 'user', 'content': '请根据以下选段提出一张问答闪卡建议。'}]})
        value = json.loads(result)
        self.assertEqual(set(value), {'front', 'back'})
        self.assertTrue(value['front'] and value['back'])
