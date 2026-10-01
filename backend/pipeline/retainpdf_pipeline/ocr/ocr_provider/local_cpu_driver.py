"""Built-in local PDF parser: native text first, optional CPU OCR for scan pages only."""
from __future__ import annotations
from contextlib import ExitStack
import hashlib
import os
import re
from pathlib import Path
import threading
from types import SimpleNamespace

from retainpdf_pipeline.foundation.shared.job_dirs import job_dirs_from_explicit_args
from retainpdf_pipeline.ocr.document_schema import (
    DOCUMENT_SCHEMA_REPORT_FILE_NAME, adapt_path_to_document_v1_with_report,
    validate_saved_document_path,
)
from retainpdf_pipeline.ocr.ocr_provider.types import OcrProviderResult
from retainpdf_pipeline.services.pipeline_shared.events import emit_stage_progress
from retainpdf_pipeline.services.pipeline_shared.io import save_json

LOCAL_OCR_ROOT_ENV = 'RETAIN_LOCAL_OCR_ROOT'
MODULE_ID = 'rapidocr-mobile-cpu'
NATIVE_VERSION = 'pymupdf-native-local-v1'
LIMITATION = '本地解析提供文字和物理页坐标；不重建公式语义、表格结构或复杂多栏阅读顺序。'


def selected_pages(value, page_count):
    raw = str(value or '').strip()
    if not raw:
        return set(range(page_count))
    selected = set()
    for part in raw.split(','):
        match = re.fullmatch(r'\s*([0-9]+)(?:\s*-\s*([0-9]+))?\s*', part)
        if not match:
            raise RuntimeError('本地 OCR 页码范围格式应为 1,3-5，使用 PDF 物理页码。')
        start, end = int(match[1]), int(match[2] or match[1])
        if not 1 <= start <= end <= page_count:
            raise RuntimeError('本地 OCR 页码范围超出 PDF 页数或起止顺序错误。')
        selected.update(range(start - 1, end))
    return selected


def run_local_cpu_ocr_to_job_dir(args: SimpleNamespace) -> OcrProviderResult:
    import fitz
    from library_mvp.ocr_jobs import OcrJobs, run_page
    from library_mvp.ocr_modules import OcrModules
    from library_mvp.store import MAX_PDF_BYTES, MAX_PAGES, MAX_EXTRACTED_CHARACTERS, StoreError, fingerprint

    raw_path = str(getattr(args, 'file_path', '') or '').strip()
    if not raw_path:
        raise RuntimeError('本地 OCR 只接受已导入的本机 PDF，请先下载或上传文件；不会调用在线 OCR。')
    source = Path(raw_path).resolve()
    if not source.is_file() or source.stat().st_size > MAX_PDF_BYTES:
        raise RuntimeError('本地 OCR 需要不超过 64 MiB 的有效 PDF 文件。')
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    job_dirs = job_dirs_from_explicit_args(args)
    raw_dir = job_dirs.ocr_dir / 'local_raw'
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / 'payload.json'
    normalized = job_dirs.ocr_dir / 'normalized' / 'document.v1.json'
    report_path = normalized.with_name(DOCUMENT_SCHEMA_REPORT_FILE_NAME)
    result_path = job_dirs.ocr_dir / 'result.json'
    cancelled = threading.Event()
    pages, characters, runtime = [], 0, None
    with ExitStack() as stack:
        pdf = stack.enter_context(fitz.open(stream=raw, filetype='pdf'))
        if pdf.needs_pass or not 1 <= pdf.page_count <= MAX_PAGES:
            raise RuntimeError('本地 OCR 不支持加密 PDF，页数须为 1 至 2000 页。')
        selected = selected_pages(getattr(args, 'page_ranges', ''), pdf.page_count)
        for page_idx, page in enumerate(pdf):
            rotation = page.rotation
            page.set_rotation(0)
            if page_idx not in selected:
                pages.append({'width': page.rect.width, 'height': page.rect.height, 'unit': 'pt',
                              'page_idx': page_idx, 'page_label': page.get_label() or str(page_idx + 1),
                              'physical_page_number': page_idx + 1, 'rotation': rotation,
                              'text_source': 'not_selected', 'blocks': []})
                continue
            blocks = []
            for block in page.get_text('blocks', sort=True):
                if len(block) >= 7 and block[6] != 0:
                    continue
                content = str(block[4]).strip()
                if content:
                    blocks.append({'text': content, 'bbox': [float(v) for v in block[:4]]})
            text_source = 'native'
            if not blocks:
                text_source = 'ocr'
                if runtime is None:
                    root = os.environ.get(LOCAL_OCR_ROOT_ENV, '').strip()
                    if not root:
                        raise RuntimeError('扫描页需要本地 OCR 模块。请在设置 → OCR 中安装模块；当前未配置模块目录，不会回退到在线服务。')
                    modules = OcrModules(Path(root), allow_download=False)
                    stack.callback(modules.close)
                    try:
                        runtime = stack.enter_context(modules.runtime_lease(MODULE_ID))
                    except StoreError as exc:
                        if exc.code == 'OCR_NOT_READY':
                            raise RuntimeError('扫描页需要本地 OCR 模块。请在设置 → OCR 中安装后重试；无需 Token，不会调用在线服务。') from exc
                        raise RuntimeError(f'本地 OCR 模块不可用（{exc.code}），请在设置 → OCR 中检查或重新安装。') from exc
                blocks = OcrJobs._blocks(run_page(page, runtime, cancelled),
                                        {'page_idx': page_idx, 'width': page.rect.width, 'height': page.rect.height})
            version = runtime['parser_version'] if text_source == 'ocr' else NATIVE_VERSION
            converted = []
            for block in blocks:
                characters += len(block['text'])
                if characters > MAX_EXTRACTED_CHARACTERS:
                    raise RuntimeError('本地解析已达到文档文字上限，未发布不完整解析结果。')
                converted.append({'type': 'text', 'sub_type': 'body', 'text': block['text'],
                                  'bbox': block['bbox'], 'lines': [], 'segments': [],
                                  'metadata': {'text_source': text_source, 'source_sha256': digest,
                                               'parser_version': version, 'physical_page_number': page_idx + 1}})
            pages.append({'width': page.rect.width, 'height': page.rect.height, 'unit': 'pt',
                          'page_idx': page_idx, 'page_label': page.get_label() or str(page_idx + 1),
                          'physical_page_number': page_idx + 1, 'rotation': rotation,
                          'text_source': text_source, 'blocks': converted})
            emit_stage_progress(stage='ocr_processing', substage='local_cpu',
                                message=f'本地解析 {page_idx + 1}/{pdf.page_count} 页',
                                provider='local', progress_current=page_idx + 1, progress_total=pdf.page_count,
                                payload={'progress_unit': 'page', 'text_source': text_source})
    parser_version = runtime['parser_version'] if runtime else NATIVE_VERSION
    revision = fingerprint({'sha256': digest, 'parser_version': parser_version, 'native_version': NATIVE_VERSION,
                            'selected_page_numbers': [i + 1 for i in sorted(selected)]})
    provenance = {'provider': 'local', 'sha256': digest, 'parser_version': parser_version,
                  'parse_revision': revision, 'native_parser_version': NATIVE_VERSION,
                  'coordinate_system': 'unrotated_pdf_points', 'limitations': [LIMITATION],
                  'selected_page_numbers': [i + 1 for i in sorted(selected)]}
    save_json(raw_path, {'provider': 'generic_flat_ocr', 'source': provenance, 'pages': pages})
    document, report = adapt_path_to_document_v1_with_report(
        source_json_path=raw_path, document_id=job_dirs.root.name,
        provider='generic_flat_ocr', provider_version=parser_version)
    document['source'].update(provenance)
    document['derived']['notes'] = LIMITATION
    for page, raw_page in zip(document['pages'], pages):
        page['metadata'] = {key: raw_page[key] for key in ('physical_page_number', 'page_label', 'rotation', 'text_source')}
    normalized.parent.mkdir(parents=True, exist_ok=True)
    save_json(normalized, document)
    report['validation'] = validate_saved_document_path(normalized)
    report['local_source'] = provenance
    save_json(report_path, report)
    save_json(result_path, {**provenance, 'source_pdf': str(source), 'normalized_document_json': str(normalized),
                            'raw_payload_json': str(raw_path), 'page_count': len(pages)})
    return OcrProviderResult(job_dirs=job_dirs, source_pdf_path=source,
                             provider_result_json_path=result_path, normalized_json_path=normalized,
                             normalized_report_json_path=report_path, provider_raw_dir=raw_dir,
                             raw_main_payload_path=raw_path)
