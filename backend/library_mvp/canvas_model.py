"""Validation and spatial outline for ReadFlow's original canvas schema."""
import math
from .store import StoreError, text

KINDS = ('excerpt', 'sticky', 'todo', 'image', 'paper', 'text', 'group')


def number(value, minimum=-1000000, maximum=1000000):
    if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum:
        raise StoreError('INVALID_CANVAS', '画布坐标或尺寸无效。')
    return value


def identity(value):
    import re
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,120}', value):
        raise StoreError('INVALID_CANVAS', '画布元素标识无效。')
    return value


def node(data):
    if not isinstance(data, dict) or data.get('type') not in KINDS:
        raise StoreError('INVALID_CANVAS', '画布元素类型无效。')
    return {
        'id': identity(data.get('id')), 'type': data['type'],
        'x': number(data.get('x')), 'y': number(data.get('y')),
        'width': number(data.get('width', 260), 80, 5000),
        'height': number(data.get('height', 180), 40, 5000),
        'text': text(data.get('text', ''), 'body', 100000),
        'annotation_id': text(data.get('annotation_id') or '', 'annotation_id', 120) or None,
        'item_id': text(data.get('item_id') or '', 'item_id', 120) or None,
    }


def edge(data):
    if not isinstance(data, dict) or data.get('style', 'arrow') not in ('arrow', 'line'):
        raise StoreError('INVALID_CANVAS', '连线类型无效。')
    return {'id': identity(data.get('id')), 'from_id': identity(data.get('from_id')),
            'to_id': identity(data.get('to_id')), 'label': text(data.get('label', ''), 'label', 200),
            'style': data.get('style', 'arrow')}


def inside(child, group):
    return child['id'] != group['id'] and child['type'] != 'group' and (
        child['x'] >= group['x'] and child['y'] >= group['y'] and
        child['x'] + child['width'] <= group['x'] + group['width'] and
        child['y'] + child['height'] <= group['y'] + group['height'])


def outline(canvas):
    nodes = sorted(canvas['nodes'], key=lambda n: (n['y'], n['x'], n['id']))
    groups = [n for n in nodes if n['type'] == 'group']
    assigned = set()
    lines = ['# ' + canvas['name']]

    def emit(node):
        assigned.add(node['id'])
        lines.append('- ' + (node['text'] or node.get('title') or ('摘录' if node.get('quote') else node['type'])).replace('\n', '\n  '))
        if node.get('quote') and node.get('quote') != node['text']:
            lines.append('\n'.join('  > ' + line for line in node['quote'].splitlines()))
        if node.get('item_id'):
            lines.append(f"  来源：{node.get('title', '')} · 第 {node.get('page', 1)} 页 · @{node.get('citekey', '')}")
        if node.get('orphaned'):
            lines.append('  原批注已删除')
    for group in groups:
        lines.append('\n## ' + (group['text'] or '分组'))
        for child in nodes:
            if child['id'] not in assigned and inside(child, group):
                emit(child)
    rest = [n for n in nodes if n['type'] != 'group' and n['id'] not in assigned]
    if rest and groups:
        lines.append('\n## 未分组')
    for child in rest:
        emit(child)
    titles = {n['id']: (n['text'] or n.get('quote') or n.get('title') or n['type']).split('\n')[0] for n in nodes}
    if canvas['edges']:
        lines.append('\n## 关系')
        for connection in canvas['edges']:
            lines.append(f"- {titles[connection['from_id']]} —{connection['label']}→ {titles[connection['to_id']]}")
    return '\n'.join(lines) + '\n'
