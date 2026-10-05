"""Compare two densities using exactly the same short, explicitly synthetic translation."""
import argparse
import json
from pathlib import Path
from backend.library_mvp.paper_blocks_model import cache_key
from backend.library_mvp.paper_blocks_layout import render_layout
from .reader_inline_fixtures import fake
from .layout_corpus import sheets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--blocks', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--page', type=int, default=4)
    args = parser.parse_args()
    for path in (args.source, args.blocks):
        if not path.is_file() or any(p.is_symlink() for p in (path, *path.parents)):
            raise ValueError('Expected regular source files')
    document = fake(json.loads(args.blocks.read_text()))
    cache = {}
    phrase = '这是用于比较段落密度的示例中文，描述方法、数据和实验结论。'
    for block in document['blocks']:
        if block.get('translation'):
            count = max(2, round(len(block['text']) * .23))
            text = '【示例】' + (phrase * (count // len(phrase) + 1))[:count]
            runs = [{'kind': 'text', 'text': text}, *block.get('translation_runs', [])[1:]]
            cache[cache_key(block, 'zh-CN', 'density-demo')] = {'text': ''.join(r['text'] for r in runs), 'runs': runs}
        for label in block.get('figure_text', []):
            if label.get('translation'):
                cache[cache_key(label, 'zh-CN', 'density-demo')] = {'text': label['translation']}
    metrics = {}
    for density in ('compact', 'balanced'):
        root = args.output / density
        root.mkdir(parents=True, exist_ok=True)
        metrics[density] = render_layout(args.source, root, document, cache, 'zh-CN', 'density-demo', density=density)
    sheets(args.output / 'compact/translated-layout.pdf', args.output / 'balanced/translated-layout.pdf',
           [args.page], args.output, ('Compact - short fake text', 'Balanced - identical fake text'))
    (args.output / 'metrics.json').write_text(json.dumps(metrics, indent=2)+'\n')


if __name__ == '__main__':
    main()
