const fs = require("fs");
const path = require("path");

/**
 * Protected (obfuscated, fused) release builds mark their packaged package.json with
 * `"readflowProtected": true`. Development and the Linux release keep DevTools available.
 */
function isProtectedBuild(appRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8")).readflowProtected === true;
  } catch {
    return false;
  }
}

module.exports = { isProtectedBuild };
