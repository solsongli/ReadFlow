import { readFileSync, writeFileSync } from 'node:fs';
import { SHORTCUTS } from '../../frontend/web/src/features/workbench/domain/shortcuts.ts';
const file = new URL('../../docs/readflow/使用说明.md', import.meta.url);
const text = readFileSync(file, 'utf8');
const start = text.indexOf('| 分类 |');
const fallback = text.indexOf('| 场景 |');
const table = start < 0 ? fallback : start;
if (table < 0) throw new Error('Shortcut table not found');
const end = text.indexOf('\n## ', table);
const rows = ['| 分类 | 快捷键 | 操作 |', '|---|---|---|', ...SHORTCUTS.map((s) =>
  `| ${s.group} | \`${s.keys}\` | ${s.label} |`)];
writeFileSync(file, text.slice(0, table) + rows.join('\n') + '\n' + text.slice(end));
