"""RapidOCR 3.9.2 subprocess adapter. All model paths are explicit and downloads forbidden."""
from contextlib import redirect_stdout
import json
import os
from pathlib import Path
import socket
import sys


class BundleIncomplete(RuntimeError):
    pass


def deny_network(*args, **kwargs):
    raise BundleIncomplete('The optional OCR bundle is incomplete; automatic downloads are forbidden.')


def recognize(request):
    # These process-local guards prevent library convenience downloaders from making requests.
    socket.create_connection = deny_network
    socket.getaddrinfo = deny_network
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    # ORT 1.30's POSIX telemetry must be disabled before its native library is imported.
    os.environ['ORT_DISABLE_TELEMETRY'] = '1'
    sys.path.insert(0, request['site'])
    import onnxruntime
    onnxruntime.disable_telemetry_events()
    from rapidocr import RapidOCR, EngineType, ModelType, OCRVersion
    from rapidocr.utils.download_file import DownloadFile
    DownloadFile.run = staticmethod(deny_network)
    params = {'Global.log_level': 'error', 'Global.return_word_box': False,
              'EngineConfig.onnxruntime.intra_op_num_threads': 2,
              'EngineConfig.onnxruntime.inter_op_num_threads': 1}
    for accelerator in ('cuda', 'dml', 'cann', 'coreml'):
        params['EngineConfig.onnxruntime.use_' + accelerator] = False
    for section, key, version in (('Det', 'det', 'PP-OCRv5'), ('Rec', 'rec', 'PP-OCRv5'), ('Cls', 'cls', 'PP-OCRv4')):
        model = Path(request['models'][key])
        if not model.is_file():
            raise BundleIncomplete('A pinned local model is missing.')
        params.update({section + '.model_path': str(model), section + '.engine_type': EngineType('onnxruntime'),
                       section + '.model_type': ModelType('mobile'), section + '.ocr_version': OCRVersion(version)})
    engine = RapidOCR(params=params)
    result = engine(request['image'])
    blocks = []
    if result.boxes is not None:
        for polygon, text, confidence in zip(result.boxes, result.txts, result.scores):
            xs, ys = [float(p[0]) for p in polygon], [float(p[1]) for p in polygon]
            blocks.append({'text': str(text), 'bbox': [min(xs), min(ys), max(xs), max(ys)],
                           'confidence': float(confidence)})
    return {'blocks': blocks, 'telemetry_opt_out': os.environ['ORT_DISABLE_TELEMETRY'] == '1'}


def main():
    try:
        request = json.loads(sys.stdin.read())
        with redirect_stdout(sys.stderr):
            result = recognize(request)
    except BundleIncomplete:
        result = {'error': {'code': 'OCR_BUNDLE_INCOMPLETE', 'message': 'The local OCR bundle is incomplete; no automatic download was attempted.'}}
    except Exception:
        result = {'error': {'code': 'OCR_PAGE_FAILED', 'message': 'The isolated CPU OCR worker could not process this page.'}}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
