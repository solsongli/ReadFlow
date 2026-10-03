function confirmedExternalUrl(value) {
  if (typeof value !== "string" || value.length > 4096) throw new Error("Invalid external link");
  const url = new URL(value);
  if (!["http:", "https:", "mailto:"].includes(url.protocol) || url.username || url.password) throw new Error("Unsupported external link");
  return url.href;
}
module.exports = { confirmedExternalUrl };
