"""Pure fake-service formatting tests; no socket or model is contacted."""
import unittest
from ops.development.readflow_fake_openai import completion_content
import json


class FakeCompletionTests(unittest.TestCase):
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
