export async function setPaperTone(page, value) {
  await page.getByRole("button", { name: "更多阅读操作", exact: true }).click();
  const label = { auto: "跟随明暗", white: "白纸", sepia: "护眼米色", night: "夜间" }[value];
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
}
export async function setTranslationFormat(page, value) {
  await page.getByRole("button", { name: "翻译菜单", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: value === "layout" ? "原版式" : "重排", exact: true })
    .click();
}
export async function translationAction(page, name) {
  await page.getByRole("button", { name: "翻译菜单", exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp("^" + name + "(?:\\s*F)?$") }).click();
}
export async function readerAction(page, name) {
  await page.getByRole("button", { name: "更多阅读操作", exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp("^" + name + "(?:\\s*F)?$") }).click();
}
export async function selectedTranslationFormat(page) {
  await page.getByRole('button',{name:'翻译菜单',exact:true}).click();
  const reflow=await page.getByRole('menuitemradio',{name:'重排',exact:true}).getAttribute('aria-checked');
  await page.keyboard.press('Escape');
  return reflow==='true'?'reflow':'layout';
}
