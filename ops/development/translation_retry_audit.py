"""Recheck existing flagged translations; reads four explicit JSON files, never model settings."""
import argparse
from collections import Counter
import json
from pathlib import Path
from backend.library_mvp.paper_blocks_model import cache_key
from backend.library_mvp.paper_blocks_labels import translation_units
from backend.library_mvp.paper_context import contextualize
from backend.library_mvp.paper_quality import checks


def audit(directory):
    paths = [directory / n for n in ('blocks.json', 'translations.json', 'result.json', 'terms.json')]
    if any(p.is_symlink() or not p.is_file() for p in paths):
        raise ValueError('Expected regular JSON files')
    document, cache, result, terminology = (json.loads(p.read_text()) for p in paths)
    terms = terminology.get(result.get('language', 'zh-CN'), {}).get('entries', [])
    before, after, rows = Counter(), Counter(), []
    for block in translation_units(contextualize(document['blocks'], terms)):
        value = cache.get(cache_key(block, result.get('language', 'zh-CN'), result['fingerprint']))
        if not isinstance(value, dict) or not value.get('qa'):
            continue
        old = value['qa']['issues']
        new = ['placeholders'] if block['id'] in result.get('translation_fallback', []) else checks(block, value, terms=terms)
        before.update(old); after.update(new)
        if old or new:
            rows.append({'id': block['id'], 'page': block['page'], 'type': block['type'], 'before': old, 'after': new})
    return {'before': dict(before), 'after': dict(after),
            'resolved_flags': sum(bool(r['before']) and not r['after'] for r in rows),
            'remaining_blocks': sum(bool(r['after']) for r in rows), 'blocks': rows}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    options = parser.parse_args()
    value = audit(options.directory)
    options.output.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k: v for k, v in value.items() if k != 'blocks'}, ensure_ascii=False))
