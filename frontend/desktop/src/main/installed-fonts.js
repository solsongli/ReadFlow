const { execFile } = require("child_process");

function fontFamilies(output) {
  return [...new Set(String(output).split(/[\n,]/).map((family) => family.trim())
    .filter((family) => family.length > 0 && family.length <= 160 && !/[\x00-\x1f\x7f;{}]/.test(family)))];
}

function createInstalledFonts({ run = (args) => new Promise((resolve, reject) => {
  execFile("fc-list", args, { timeout: 5000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
    (error, stdout) => error ? reject(new Error("无法读取本机字体，请确认系统提供 fontconfig。")) : resolve(stdout));
}) } = {}) {
  return {
    async list() {
      // Family metadata only: no filenames, font contents, shell, or network.
      const [all, chinese] = await Promise.all([run(["--format", "%{family}\n"]), run([":lang=zh", "--format", "%{family}\n"])]);
      const supportsChinese = new Set(fontFamilies(chinese));
      return fontFamilies(all).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
        .map((family) => ({ family, chinese: supportsChinese.has(family) }));
    },
  };
}

module.exports = { createInstalledFonts, fontFamilies };
