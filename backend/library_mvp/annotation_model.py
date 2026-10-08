"""ReadFlow annotation validation and presentation, independent of reader implementations."""
import math

from .store import StoreError, strings, text

COLORS = ('yellow', 'blue', 'green', 'red', 'purple')
TYPES = ('highlight', 'underline', 'sticky', 'region', 'ink')
SEMANTICS = dict(zip(COLORS, ('重要', '方法', '结论 / 结果', '疑问 / 存疑', '概念 / 术语')))


def invalid(message='批注数据无效。'):
    raise StoreError('INVALID_ANNOTATION', message)


def unit(value):
    if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
        invalid('批注坐标必须在 0–1 之间。')
    return value


def validate(data, attachment, *, migrated=False):
    if data.get('type') not in TYPES or data.get('color') not in COLORS:
        invalid('批注类型或颜色无效。')
    page = data.get('page_index')
    if type(page) is not int or not 0 <= page < attachment['page_count']:
        invalid('批注页码超出原文范围。')
    rects, ink = data.get('rects', []), data.get('ink', [])
    if not isinstance(rects, list) or len(rects) > 2000:
        invalid()
    for rect in rects:
        if not isinstance(rect, dict) or set(rect) != {'x', 'y', 'width', 'height'}:
            invalid()
        for value in rect.values():
            unit(value)
        if rect['x'] + rect['width'] > 1.000001 or rect['y'] + rect['height'] > 1.000001:
            invalid()
    if not isinstance(ink, list) or len(ink) > 10000:
        invalid()
    for point in ink:
        if not isinstance(point, dict) or set(point) != {'x', 'y'}:
            invalid()
        unit(point['x'])
        unit(point['y'])
    if not migrated and ((data['type'] == 'ink' and len(ink) < 2) or
                         (data['type'] != 'ink' and not rects)):
        invalid('批注需要有效的页面位置。')
    width = data.get('width', 2)
    if width not in (1, 2, 4):
        invalid('画笔粗细无效。')
    return {
        'attachment_id': attachment['id'], 'page_index': page,
        'type': data['type'], 'color': data['color'], 'rects': rects, 'ink': ink,
        'quote': text(data.get('quote', ''), 'quote', 100000),
        'note': text(data.get('note', ''), 'body', 100000),
        'tags': strings(data.get('tags', []), 'annotation tags', maximum=50, length=60),
        'width': width,
    }


def semantics(data):
    if not isinstance(data, dict) or set(data) != set(COLORS):
        invalid('需要五种颜色的含义。')
    return {color: text(data[color], color, 40, required=True) for color in COLORS}


def note_view(row):
    return {
        'id': row['id'], 'item_id': row['item_id'], 'attachment_id': row['attachment_id'],
        'page_idx': row['page_index'], 'quote': row['quote'], 'translated_quote': '',
        'body': row['note'], 'color': row['color'], 'kind': 'annotation',
        'created_at': row['created_at'], 'updated_at': row['updated_at'],
        'annotation_type': row['type'], 'image_ref': row['image_ref'],
        'tags': row.get('tags', []),
    }


def markdown(rows, labels, citation):
    sections = []
    for color in COLORS:
        selected = [row for row in rows if row['color'] == color]
        if not selected:
            continue
        sections.append('## ' + labels[color])
        for row in sorted(selected, key=lambda value: (value['page_index'], value['created_at'])):
            sections.append(f"### 第 {row['page_index'] + 1} 页 · {row['type']}")
            if row['quote']:
                sections.append('\n'.join('> ' + line for line in row['quote'].splitlines()))
            if row['image_ref']:
                sections.append(f"![区域截图](/api/research/annotations/{row['id']}/image)")
            if row['note']:
                sections.append(row['note'])
            if row.get('tags'):
                sections.append('标签：' + '、'.join(row['tags']))
    return '\n\n'.join([*sections, '---', citation]) + '\n'
