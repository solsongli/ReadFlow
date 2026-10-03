import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 校验阅读器 DOM 字面量的归属。
const PROJECT_ROOT = process.cwd();
const STYLES_ROOT = join(PROJECT_ROOT, "src/styles");
// Reader 的样式真值在 @retainpdf/reader 包内(web 侧只做代理入口),
// 归属校验必须一并扫描,否则包内自有的 .reader-* 规则会被误判成孤儿。
const PACKAGE_STYLE_ROOTS = [join(PROJECT_ROOT, "../packages/reader/styles")];

// 已确认的历史遗留引用(运行时元素/类确实不存在)。新增条目前必须先人工确认,
// 并注明原因;一旦引用恢复归属,下方的 hygiene 用例会强制从这里移除。
const KNOWN_ORPHANS = { "../packages/reader/src": ["reader-ai-pending", "reader-embedded"] };
const PAGES = [{ jsDir: "../packages/reader/src", prefix: "reader", htmlFile: "reader.html",
  jsxDir: "src/app/reader", extraJsDirs: ["src/features/reader/domain/dialog"],
  extraJsxDirs: ["../packages/reader/src"] }];

function walkFiles(dir, extension) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...walkFiles(fullPath, extension));
    } else if (entry.endsWith(extension)) {
      results.push(fullPath);
    }
  }
  return results;
}

function collectLiterals(jsFiles, prefix) {
  const pattern = new RegExp(`["']((?:data-)?${prefix}-[a-z0-9-]+)["']`, "g");
  const literals = new Map();
  for (const file of jsFiles) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(pattern)) {
      const literal = match[1];
      if (!literals.has(literal)) {
        literals.set(literal, relative(PROJECT_ROOT, file));
      }
    }
  }
  return literals;
}

function collectOwnership(htmlText, jsTexts, cssText, jsxTexts = []) {
  const ids = new Set(
    [...htmlText.matchAll(/id="([a-z0-9-]+)"/g)].map((m) => m[1]),
  );
  for (const text of [...jsTexts, ...jsxTexts]) {
    for (const match of text.matchAll(/\bid\s*=\s*"([a-z0-9-]+)"/g)) {
      ids.add(match[1]);
    }
  }
  const classes = new Set();
  for (const match of htmlText.matchAll(/class="([^"]+)"/g)) {
    for (const name of match[1].split(/\s+/)) {
      classes.add(name);
    }
  }
  // React 页面骨架:JSX 的 className 等价于旧 HTML 的 class 归属
  for (const text of jsxTexts) {
    for (const match of text.matchAll(/className="([^"]+)"/g)) {
      for (const name of match[1].split(/\s+/)) {
        classes.add(name);
      }
    }
  }
  for (const match of cssText.matchAll(/\.([a-z0-9][a-z0-9-]*)/g)) {
    classes.add(match[1]);
  }
  // data-* 属性不是 id/class，但同样可能被改名后静默失效：把 JS/JSX 中的
  // JSX 属性名、setAttribute/getAttribute 引用的属性名纳入归属集合。
  const attributes = new Set();
  for (const text of [...jsTexts, ...jsxTexts]) {
    for (const match of text.matchAll(/\b(data-[a-z0-9-]+)\s*[={]/g)) {
      attributes.add(match[1]);
    }
    for (const match of text.matchAll(/\b(?:set|get|remove)Attribute\s*\(\s*["'](data-[a-z0-9-]+)["']/g)) {
      attributes.add(match[1]);
    }
  }
  // 契约常量(如 READER_PAGE_ATTR = "data-reader-page")是名字的唯一真值来源，
  // 其声明本身就构成归属，否则常量定义会被误判成孤儿。
  const declarations = new Set();
  for (const text of [...jsTexts, ...jsxTexts]) {
    for (const match of text.matchAll(/\b(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*["']([a-z][a-z0-9-]*)["']/g)) {
      declarations.add(match[1]);
    }
  }
  return { ids, classes, attributes, declarations };
}

function isOwned(literal, ownership) {
  if (
    ownership.ids.has(literal)
    || ownership.classes.has(literal)
    || ownership.attributes.has(literal)
    || ownership.declarations.has(literal)
  ) {
    return true;
  }
  // 复合 id 模式,如 showReaderPaneEmpty 用 "reader-pdf" 拼出 "reader-pdf-wrap"
  const family = `${literal}-`;
  for (const id of ownership.ids) {
    if (id.startsWith(family)) {
      return true;
    }
  }
  return false;
}

function analyzePage({ jsDir, prefix, htmlFile, jsxDir = "", extraJsDirs = [], extraJsxDirs = [] }) {
  // 原先 collectJsFiles / collectJsxTexts 用 try/catch 吞掉缺失目录并返回 []：
  // 目录一被搬走，字面量集合或归属集合就悄悄缩水（home 页更是走 optional 分支
  // 直接返回，彻底静默变绿）。改为缺目录即失败，并点名是哪个根、什么角色。
  function requireScanDir(dir, role) {
    const full = join(PROJECT_ROOT, dir);
    assert.ok(existsSync(full), `扫描根不存在，门禁已失效: ${dir}（${role}）`);
    return full;
  }
  // TS 迁移后源文件是 .ts/.tsx；仍兼容残留 .js/.jsx
  function collectJsFiles(dir, role) {
    const full = requireScanDir(dir, role);
    return [
      ...walkFiles(full, ".ts"),
      ...walkFiles(full, ".tsx"),
      ...walkFiles(full, ".js"),
    ];
  }
  function collectJsxTexts(dir, role) {
    const full = requireScanDir(dir, role);
    return [
      ...walkFiles(full, ".tsx"),
      ...walkFiles(full, ".jsx"),
      ...walkFiles(full, ".ts"),
      ...walkFiles(full, ".js"),
    ].map((file) => readFileSync(file, "utf8"));
  }
  let jsFiles = collectJsFiles(jsDir, "jsDir");
  for (const extra of extraJsDirs) {
    jsFiles.push(...collectJsFiles(extra, "extraJsDirs"));
  }
  jsFiles = [...new Set(jsFiles)].sort();
  const jsTexts = jsFiles.map((file) => readFileSync(file, "utf8"));
  let jsxTexts = jsxDir ? collectJsxTexts(jsxDir, "jsxDir") : [];
  for (const extra of extraJsxDirs) {
    jsxTexts.push(...collectJsxTexts(extra, "extraJsxDirs"));
  }
  const htmlText = readFileSync(join(PROJECT_ROOT, htmlFile), "utf8");
  const cssText = [STYLES_ROOT, ...PACKAGE_STYLE_ROOTS]
    .flatMap((root) => {
      // 样式根消失会让归属集合缩水、把正常引用误判成孤儿；报错要指向真正的原因。
      assert.ok(existsSync(root), `样式扫描根不存在，归属校验已失效: ${relative(PROJECT_ROOT, root)}`);
      return walkFiles(root, ".css");
    })
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const literals = collectLiterals(jsFiles, prefix);
  const ownership = collectOwnership(htmlText, jsTexts, cssText, jsxTexts);
  return { literals, ownership };
}

test("KNOWN_ORPHANS 的键与 PAGES 的 jsDir 对齐", () => {
  // 键写错或页面 jsDir 改了而键没跟上时，new Set(undefined) 会得到空豁免集，
  // 下面两条用例都照样通过——豁免清单静默失效，没人会发现。
  const jsDirs = new Set(PAGES.map((page) => page.jsDir));
  const orphanKeys = Object.keys(KNOWN_ORPHANS);
  assert.deepEqual(
    orphanKeys.filter((key) => !jsDirs.has(key)),
    [],
    `KNOWN_ORPHANS 里有 PAGES 中不存在的 jsDir 键，豁免清单已失效：${orphanKeys.join(", ")}`,
  );
});

for (const page of PAGES) {
  const allowlist = new Set(KNOWN_ORPHANS[page.jsDir]);

  test(`${page.jsDir} 的 ${page.prefix}-* 引用在 ${page.htmlFile}/样式/模板中有归属`, () => {
    const { literals, ownership } = analyzePage(page);
    if (page.optional && literals.size === 0) {
      // home 无单一前缀约束，允许零字面量；若未来出现 home-* 归属再校验
      return;
    }
    assert.ok(literals.size > 0, `未在 ${page.jsDir} 中找到任何 ${page.prefix}-* 字面量,检查扫描逻辑`);
    const orphans = [];
    for (const [literal, file] of literals) {
      if (!isOwned(literal, ownership) && !allowlist.has(literal)) {
        orphans.push(`${literal} (首见于 ${file})`);
      }
    }
    assert.deepEqual(
      orphans,
      [],
      `以下引用在 ${page.htmlFile} 的 id/class、src/styles 类定义、JS 自建元素中均不存在,` +
        `会在运行时静默失效:\n  ${orphans.join("\n  ")}`,
    );
  });

  test(`${page.jsDir} 的 KNOWN_ORPHANS 清单没有过期条目`, () => {
    const { literals, ownership } = analyzePage(page);
    if (page.optional && literals.size === 0 && allowlist.size === 0) {
      return;
    }
    const stale = [];
    for (const literal of allowlist) {
      if (!literals.has(literal) || isOwned(literal, ownership)) {
        stale.push(literal);
      }
    }
    assert.deepEqual(
      stale,
      [],
      `以下 KNOWN_ORPHANS 条目已不再是孤儿(引用被删除或已恢复归属),请从清单移除:${stale.join(", ")}`,
    );
  });
}
