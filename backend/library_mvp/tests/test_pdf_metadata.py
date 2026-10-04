import tempfile
from pathlib import Path
import unittest
import pymupdf
from backend.library_mvp.store import Store
from backend.library_mvp.pdf_metadata import pdf_metadata
from backend.library_mvp.connector_status import public_connector_status


class MetadataTests(unittest.TestCase):
    def test_names_and_tool_noise(self):
        self.assertEqual(pdf_metadata({'author': 'Wei Zhang; Jane Doe and 王明'})['authors'], ['Wei Zhang', 'Jane Doe', '王明'])
        self.assertEqual(pdf_metadata({'author': '张三，李四; Microsoft Word'})['authors'], ['张三', '李四'])
        self.assertEqual(pdf_metadata({'author': 'John Word'})['authors'], ['John Word'])
        self.assertEqual(pdf_metadata({'author': 'Zhang, Wei'})['authors'], ['Zhang, Wei'])
        self.assertEqual(pdf_metadata({'author': 'Wei Zhang, Jane Doe'})['authors'], ['Wei Zhang', 'Jane Doe'])
        for value in ['', 'LaTeX with hyperref', 'Microsoft Word', 'Adobe Acrobat']:
            self.assertEqual(pdf_metadata({'author': value})['authors'], [])

    def test_subject_keywords_and_real_pdf_import(self):
        meta = {'author': 'Alice Zhang; Bob Smith', 'subject': 'Abstract: Synthetic evidence.',
                'keywords': 'robotics; safety, robotics'}
        with tempfile.TemporaryDirectory() as tmp, pymupdf.open() as pdf:
            pdf.new_page()
            pdf.set_metadata(meta)
            store = Store(Path(tmp))
            try:
                item = store.add_pdf(pdf.tobytes(), filename='synthetic.pdf')['item']
                self.assertEqual(item['authors'], ['Alice Zhang', 'Bob Smith'])
                self.assertEqual(item['tags'], ['robotics', 'safety'])
                self.assertEqual(item['abstract'], 'Synthetic evidence.')
            finally:
                store.close()
        self.assertEqual(pdf_metadata({'subject': 'template'})['abstract'], '')

    def test_connector_public_shape_and_real_version(self):
        value = public_connector_status({'status': 'listening', 'port': 23119, 'occupant': None,
            'partial_acceptance': {}, 'client': 'RetainPDF', 'real_connector_verified': True}, '0.9.5')
        self.assertEqual(value, {'status': 'listening', 'port': 23119, 'occupant': None,
                               'client': 'ReadFlow', 'product_version': '0.9.5'})
        self.assertEqual(public_connector_status({})['product_version'], '开发版')
