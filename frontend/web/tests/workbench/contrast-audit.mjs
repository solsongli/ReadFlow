// Synthetic browser pages only. Do not collect text, input values or configuration in diagnostics.
export async function contrastAudit(page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  return page.evaluate(() => {
    const rgba = (value) => { const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1]; };
    const blend = (front, back) => [...front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3])), 1];
    const luminance = (color) => color.slice(0, 3).map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const checked = new Set(), failures = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, el = node.parentElement;
      if (!node.textContent.trim() || !el || checked.has(el) || el.closest('script,style,svg,option,[disabled],[aria-disabled="true"],[aria-hidden="true"]')) continue;
      checked.add(el);
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight || style.visibility !== "visible") continue;
      const ancestors = []; for (let parent = el; parent; parent = parent.parentElement) ancestors.unshift(parent);
      let background = [255, 255, 255, 1], opacity = 1;
      for (const ancestor of ancestors) { const computed = getComputedStyle(ancestor); background = blend(rgba(computed.backgroundColor), background); opacity *= Number(computed.opacity); }
      if (opacity < 0.05) continue;
      const color = rgba(style.color); color[3] *= opacity;
      const text = luminance(blend(color, background)), base = luminance(background);
      const ratio = (Math.max(text, base) + 0.05) / (Math.min(text, base) + 0.05);
      if (ratio < 4.5) failures.push({ tag: el.tagName, classes: el.className, ratio: Math.round(ratio * 100) / 100 });
    }
    return failures.slice(0, 20);
  });
}
export async function iconLabelAudit(page) {
  return page.locator("button").evaluateAll((buttons) => buttons.filter((el) => {
    const box = el.getBoundingClientRect(); return box.width && box.height && !el.textContent.trim() && (!el.getAttribute("aria-label") || !el.getAttribute("title"));
  }).map((el) => ({ classes: el.className, label: el.getAttribute("aria-label") })));
}
