"""Read only blocks.json and translations.json; never opens credentials or calls a model."""
import argparse
from collections import Counter
import json
import re
from pathlib import Path
from backend.library_mvp.paper_blocks_model import cache_key, SKIP
from backend.library_mvp.paper_blocks_inline import rich_text
from backend.library_mvp.paper_quality import checks, citations, numbers
from backend.library_mvp.paper_quality_text import paired_numbers
from backend.library_mvp.paper_terms import normalize, relevant, effective
from backend.library_mvp.paper_blocks_labels import translation_units


def measure(document, cache, language, fingerprint, terms=()):
    ratios, rows = [], []
    retained, expected = Counter(), Counter()
    terms = normalize(terms)
    term_ok = term_total = untranslated = 0
    units = translation_units(document['blocks'])
    for block in units:
        if block['type'] in SKIP:
            continue
        value = cache.get(cache_key(block, language, fingerprint))
        if not value:
            continue
        text = rich_text(value)
        issues = checks(block, {'text': text}, language, terms)
        ratios.append(len(text) / max(1, len(block['text'])))
        untranslated += 'untranslated' in issues
        for key, fn in [('citations', citations), ('numbers', numbers)]:
            before, after = paired_numbers(block, value if isinstance(value, dict) else {'text': value}) if key == 'numbers' else (fn(block['text']), fn(text))
            expected[key] += sum(before.values())
            retained[key] += sum((before & after).values())
        for term in relevant(terms, [block]):
            count = len(re.findall(r'(?<!\w)' + re.escape(term['source']) + r'(?!\w)', block['text'], re.I))
            term_total += count
            term_ok += min(count, len(re.findall(re.escape(term['target']), text, re.I)))
        rows.append({'id': block['id'], 'page': block['page'], 'issues': issues})
    ordered = sorted(ratios)
    percentile = lambda p: round(ordered[round((len(ordered) - 1) * p)], 3) if ordered else None
    return {'blocks': len(rows), 'source_blocks': sum(b['type'] not in SKIP for b in units),
            'retention': {k: {'expected': expected[k], 'retained': retained[k],
                             'rate': retained[k] / expected[k] if expected[k] else None} for k in ('citations', 'numbers')},
            'untranslated_rate': untranslated / len(rows) if rows else None,
            'terminology': {'occurrences': term_total, 'matched': term_ok, 'rate': term_ok / term_total if term_total else None},
            'length_ratio': {'p10': percentile(.1), 'p50': percentile(.5), 'p90': percentile(.9)}, 'review': rows}


def run(options):
    # Explicit file arguments avoid scanning a profile or any configuration file.
    paths = [options.quality_blocks, options.translations]
    if options.terms_file:
        paths.append(options.terms_file)
    if options.user_terms:
        paths.append(options.user_terms)
    if any(not p.is_file() or any(q.is_symlink() for q in [p, *p.parents]) for p in paths):
        raise ValueError('Expected regular explicit JSON files, no symlinks')
    document, cache = (json.loads(p.read_text()) for p in paths[:2])
    terms = json.loads(options.terms_file.read_text()) if options.terms_file else []
    if isinstance(terms, dict):
        terms = terms.get(options.language, terms).get('entries', [])
    user_terms = json.loads(options.user_terms.read_text()) if options.user_terms else []
    if isinstance(user_terms, dict):
        user_terms = user_terms.get(options.language, user_terms).get('entries', [])
    terms = effective(terms, user_terms)
    result = measure(document, cache, options.language, options.fingerprint, terms)
    options.output.mkdir(parents=True, exist_ok=True)
    (options.output / 'quality.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'review'}, ensure_ascii=False))


def arguments(parser):
    parser.add_argument('--quality-blocks', type=Path, help='Offline QA mode: explicit blocks.json')
    parser.add_argument('--translations', type=Path, help='Existing translations.json, read only')
    parser.add_argument('--fingerprint', default='', help='Service fingerprint for the cache being evaluated')
    parser.add_argument('--language', default='zh-CN')
    parser.add_argument('--terms-file', type=Path)
    parser.add_argument('--user-terms', type=Path, help='Optional exported user glossary JSON, takes precedence')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    arguments(parser)
    parser.add_argument('--output', required=True, type=Path)
    run(parser.parse_args())
